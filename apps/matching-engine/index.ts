import { createClient } from 'redis';
import { prisma } from 'database';
import {
  MatchingEngine,
  type Asset,
  type EngineResponse,
  type EngineResult,
  type EngineStatus,
  type OrderInput,
  type RequestStatus,
} from './engine';

if (!process.env.REDIS_URL) {
  throw new Error('REDIS_URL is not set');
}

export type engineStatus = EngineStatus;
export type requestStatus = RequestStatus;
export type engineResponse = EngineResponse;

export type engineCommand =
  | 'create_order'
  | 'cancel_order'
  | 'get-order'
  | 'get-balance'
  | 'get-depth'
  | 'create-asset';

export interface engineRequest {
  backend_id: string;
  request_id: string;
  payload: any;
  command: engineCommand;
}

const client = createClient({ url: process.env.REDIS_URL });
client.on('error', (err: any) =>
  console.log({ msg: 'Redis client error', err }),
);

const publishclient = createClient({ url: process.env.REDIS_URL });
publishclient.on('error', (err: any) =>
  console.log({ msg: 'Redis client error', err }),
);

const dbWorkerclient = createClient({ url: process.env.REDIS_URL });
dbWorkerclient.on('error', (err: any) =>
  console.log({ msg: 'Redis client error', err }),
);

const riskEngclient = createClient({ url: process.env.REDIS_URL });
riskEngclient.on('error', (err: any) =>
  console.log({ msg: 'Redis client error', err }),
);

const riskEngPubclient = createClient({ url: process.env.REDIS_URL });
riskEngPubclient.on('error', (err: any) =>
  console.log({ msg: 'Redis client error', err }),
);

const liquidationClient = createClient({ url: process.env.REDIS_URL });
liquidationClient.on('error', (err: any) =>
  console.log({ msg: 'Redis client error', err }),
);

//incoming-request => client => for receiving request from api to matching engine
// response-queue-${backend_id} => publishclient => for sending matching engine response back to api
// settlement-queue => dbWorkerclient => for db worker to fills and settlements
// risk-to-matching-eng => riskEngclient => to receive perp order from risk engine

const engine = new MatchingEngine();

const publishResult = (result: EngineResult, backend_id: string) => {
  for (const message of result.settlement) {
    dbWorkerclient.lPush('settlement-queue', JSON.stringify(message));
  }

  for (const message of result.risk) {
    riskEngPubclient.lPush('matching-to-risk-pub-queue', JSON.stringify(message));
  }

  if (result.response !== undefined && result.response !== null) {
    publishclient.lPush(
      `response-queue-${backend_id}`,
      JSON.stringify(result.response),
    );
  }
};

const create_order = (
  payload: OrderInput,
  backend_id: string,
  request_id: string,
  request_type?: string,
  command?: string,
) => {
  publishResult(
    engine.createOrder(payload, request_id, { request_type, command }),
    backend_id,
  );
};

const cancel_order = (payload: string, backend_id: string, request_id: string) => {
  publishResult(engine.cancelOrder(payload, request_id), backend_id);
};

const get_order = (payload: string, backend_id: string, request_id: string) => {
  publishResult(engine.getOrder(payload, request_id), backend_id);
};

const get_balance = (payload: any, backend_id: string, request_id: string) => {
  publishResult(engine.getBalance(payload, request_id), backend_id);
};

const get_depth = (payload: string, backend_id: string, request_id: string) => {
  publishResult(engine.getDepth(payload, request_id), backend_id);
};

const create_asset = (payload: Asset, backend_id: string, request_id: string) => {
  publishResult(engine.createAsset(payload, request_id), backend_id);
};

let engine_status: engineStatus = 'down';

await Promise.all([
  client.connect(),
  publishclient.connect(),
  dbWorkerclient.connect(),
  riskEngclient.connect(),
  riskEngPubclient.connect(),
  liquidationClient.connect(),
]);

while (1) {
  if (engine_status == 'down') {
    engine_status = 'pending';
  }
  //get the asset and markets from db, last snapshot from s3 and construct orderbook
  //matching engine will not accept order until it create and all markets spot and perps for all asset pairs

  if (engine_status != 'ready') {
    const markets = await prisma.market.findMany();

    if (!markets) {
      //error market not intitialized
    }

    for (let i = 0; i < markets.length; i++) {
      engine.orderbook.set(markets[i]?.symbol || 'Undefined', {
        asks: new Map(),
        bids: new Map(),
      });
    }

    engine_status = 'ready';
  }


  const req = await client.brPop(
    ['liquidation-to-matching-eng', 'incoming-request', 'risk-to-matching-eng'],
    0,
  );

  let parsed_liquidation_req;
  let parsed_req;
  let parsed_risk_req;

  if (req) {
    if (req.key === 'liquidation-to-matching-eng') {
      parsed_liquidation_req = JSON.parse(req.element);
    } else if (req.key === 'incoming-request') {
      parsed_req = JSON.parse(req.element);
    } else if (req.key === 'risk-to-matching-eng') {
      parsed_risk_req = JSON.parse(req.element);
    }
  }

  if (engine_status != 'ready' && parsed_req) {
    const res_data: engineResponse = {
      request_id: parsed_req.request_id,
      status: 'order rejected',
      message: 'Matching engine is not ready to accept orders',
      order_id: '',
      price: 0,
      filled_quantity: 0,
    };

    publishclient.lPush(
      `response-queue-${parsed_req.BACKEND_ID}`,
      JSON.stringify(res_data),
    );
  }

  if (parsed_liquidation_req) {
    if (parsed_liquidation_req.command == 'forced-liquidate') {
      create_order(
        parsed_liquidation_req.payload,
        parsed_liquidation_req.BACKEND_ID,
        parsed_liquidation_req.request_id,
      );
    }
  }

  if (parsed_req) {
    if (parsed_req.command === 'create-order') {
      const price = Number(parsed_req.payload.price);
      const quantity = Number(parsed_req.payload.quantity);

      create_order(
        { ...parsed_req.payload, price, quantity },
        parsed_req.BACKEND_ID,
        parsed_req.request_id,
      );
    } else if (parsed_req.command === 'cancel-order') {
      cancel_order(
        parsed_req.payload,
        parsed_req.BACKEND_ID,
        parsed_req.request_id,
      );
    } else if (parsed_req.command === 'get-order') {
      get_order(parsed_req.payload, parsed_req.BACKEND_ID, parsed_req.request_id);
    } else if (parsed_req.command === 'get-balance') {
      get_balance(
        parsed_req.payload,
        parsed_req.BACKEND_ID,
        parsed_req.request_id,
      );
    } else if (parsed_req.command === 'get-depth') {
      get_depth(parsed_req.payload, parsed_req.BACKEND_ID, parsed_req.request_id);
    } else if (parsed_req.command === 'create-asset') {
      create_asset(
        parsed_req.payload,
        parsed_req.BACKEND_ID,
        parsed_req.request_id,
      );
    }
  }

  if (parsed_risk_req) {
    if (parsed_risk_req.command === 'create-order') {
      const price = Number(parsed_risk_req.payload.price);
      const quantity = Number(parsed_risk_req.payload.quantity);

      create_order(
        { ...parsed_risk_req.payload, price, quantity },
        parsed_risk_req.BACKEND_ID,
        parsed_risk_req.request_id,
        'perp',
      );
    } else if (parsed_risk_req.command === 'close-position') {
      const price = Number(parsed_risk_req.payload.price);
      const quantity = Number(parsed_risk_req.payload.quantity);

      create_order(
        { ...parsed_risk_req.payload, price, quantity },
        parsed_risk_req.BACKEND_ID,
        parsed_risk_req.request_id,
        'perp',
        'close-position',
      );
    }
  }
}
