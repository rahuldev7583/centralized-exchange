import express from 'express';
import { client } from '..';
import { createClient } from 'redis';

const router = express();

const BACKEND_ID = 1;

async function get_identifier() {
  const client = createClient();

  client.on('error', (err: any) =>
    console.log({ msg: 'Redis client error', err }),
  );

  client.connect();
  console.log('Connected');
  const filled = await client.brPop('filled-order', 2);

  console.log('wait for identifier');

  console.log({ filled });
  return filled;
}

router.post('/api/order', async (req, res) => {
  //todo
  // if user has wallet balance than than value they wanted to buy then throw error

  //  if user has asset quantity less than they wanted to sell , then throw error

  //if asset is not available on orderbook throw error

  // //  publish to queue
  //  wait until we got request identifier
  //return filled quantity

  const { type, side, quantity, price, asset, user_id } = req.body;

  console.log({ asset });

  const req_id = (Math.random() * 1000).toFixed(0);

  console.log({ req_id });

  const wallet_balance = 100000;

  if (side == 'buy' && price * quantity > wallet_balance) {
    return res.status(404).json({ message: 'Insufficient wallet balance' });
  }

  //  get from db
  const available_assets = [
    {
      asset: 'BTC',
      quantity: 100,
    },
    {
      asset: 'ETH',
      quantity: 200,
    },
  ];

  const current_asset: any = available_assets.find((a) => a.asset == asset);

  if (!current_asset) {
    return res.status(404).json({ message: 'Asset not found' });
  }

  if (side == 'sell' && current_asset?.quantity < quantity) {
    return res
      .status(404)
      .json({ message: 'Not enough asset quantity to sell' });
  }

  // Every message sent from the backend to the engine includes:

  //correlationId
  //responseQueue
  //type
  //payload

  //The engine must reply to message.responseQueue and include the same correlationId.

  const payload = { type, quantity, price, asset, user_id, side };

  await client.lPush(
    'incoming_req',
    JSON.stringify({ req_id, payload, command: 'create-order' }),
  );

  //  wait until we got request identifier
  //return filled quantity

  const res_data: any = await get_identifier();

  console.log({ res_data });

  const parsed_res = JSON.parse(res_data?.element);

  console.log({ parsed_res });

  res.json({ message: 'order placed', data: parsed_res });
});

router.get('/api/order/:id', (req, res) => {
  //todo
  //  sends get-order
});

router.get('/api/order/open', (req, res) => {
  //todo
});

router.delete('/api/order/:id', (req, res) => {
  //  todo
  //  sends cancel-order
});

router.get('/api/balance', (req, res) => {
  //todo
  //  sends get-user-balance to engine
  //  include usd and all assets balance
});

router.get('/api/onramp', (req, res) => {
  //call onramp service and add amount to user wallet
  console.log('on ramp called');

  res.json('onramp called');
});

router.get('/api/depth/:symbol', (req, res) => {
  //todo
  //sends get-depth to engine
});

export default router;
