import { createClient } from 'redis';

const client = createClient();

client.on('error', (err: any) =>
  console.log({ msg: 'Redis client error', err }),
);

client.connect();
console.log('Connected');

const publishclient = createClient();

publishclient.on('error', (err: any) =>
  console.log({ msg: 'Redis client error', err }),
);

publishclient.connect();

console.log('Connected');

const ORDERBOOK: any = {
  BTC: {
    bids: [],
    asks: [],
  },
  ETH: {
    bids: [],
    asks: [],
  },
};

const FILLS: any = [];
const BALANCES: any = [];
const ORDERS: any = [];

const create_order = (payload: any) => {
  const asset = ORDERBOOK[payload.asset];
  console.log({ asset });

  if (!asset) {
    console.log('asset not available on orderbook');

    //error asset not available on orderbook
  }

  let total_quan = 0;

  if (payload.side === 'buy') {
    asset.asks.map((o: any) => {
      console.log({ o });

      total_quan += o.quantity;
    });
  } else {
    asset.bids.map((o: any) => {
      console.log({ o });

      total_quan += o.quantity;
    });
  }

  console.log({ total_quan });

  //for buy => lowest available price on orderbook
  //for sell => highest available price on orderbook

  if (payload.type == 'market') {
    //execute immediately
    //calculate best price and update orderbook

    if (payload.side === 'buy') {
      console.log({ asset });

      const find_lowest = asset.asks.reduce((p: any, c: any) => {
        console.log({ p, c });

        if (
          p[payload.asset] &&
          p[payload.asset].price < c[payload.asset].price
        ) {
          console.log({ p });

          return p;
        } else {
          console.log({ c });

          return c;
        }
      }, {});
      console.log({ find_lowest });

      const low_price = (find_lowest.price && find_lowest.price) || 0;
      console.log({ low_price });

      //todo
    } else if (payload.side === 'sell') {
      //todo
    }
  } else {
    if (payload.side == 'buy') {
      //fill order, decrease user wallet balance , increase that asset , decrease that asset quantity from orderbook

      console.log({ asset });

      const find_lowest = asset.asks.reduce((p: any, c: any) => {
        console.log({ p, c });

        if (
          p[payload.asset] &&
          p[payload.asset].price < c[payload.asset].price
        ) {
          console.log({ p });

          return p;
        } else {
          console.log({ c });

          return c;
        }
      }, {});
      console.log({ find_lowest });

      //  console.log({ lowest });

      console.log({ find_lowest, payload });
      console.log({ price: find_lowest[payload?.asset]?.price });

      const low_price = (find_lowest.price && find_lowest.price) || 0;
      console.log({ low_price });

      //  if there is no asks then no need to compare
      if (
        ORDERBOOK[payload?.asset].asks.length == 0 ||
        payload.price < low_price
      ) {
        console.log('push to orderbook');

        const asset_name = payload.asset;

        const set_asset = {
          side: payload.side,
          price: payload.price,
          quantity: payload.quantity,
          user_id: payload.user_id,
          req_id: payload.req_id,
        };

        console.log({ set_asset });

        ORDERBOOK[payload.asset].bids.push(set_asset);
        console.log({ updatedOrderbook: ORDERBOOK });

        console.log({ bids: ORDERBOOK.BTC.bids });

        const res_data = {
          identifier: payload.req_id,
          price: payload.price,
          filled_quantity: 0,
        };

        publishclient.lPush('filled-order', JSON.stringify(res_data));
      } else {
        console.log('else called');

        //order will partially or fully filled

        //decrease the quantity from orderbook
        //if no other quantity on orderbook of that asset then remove the asset as well

        console.log({ ORDERBOOKAT219: ORDERBOOK });

        let filled_quantity = 0;
        let new_asks: any = [];
        ORDERBOOK[payload.asset].asks.map((o: any) => {
          console.log({ orderat221: o });

          console.log('decrease sell side of asset quantity');

          //decrease the sell side of that asset quantity

          if (o.price <= payload.price) {
            console.log('price got matched or available at lower price');
            console.log({ sellOrdr: o });

            if (o.quantity > payload.quantity) {
              filled_quantity = payload.quantity;
              //  decrease the quantity on asks

              o = {
                ...o,
                quantity: o.quantity - payload.quantity,
              };

              console.log({ o });

              new_asks.push(o);
            } else {
              filled_quantity = o.quantity;

              //decrease the quantity on asks and remove that order because either we don't have that much or exactly that much so quantity zero left on orderbook
            }

            //it should check all order available at that price until the either order got filled, or no other order available at that price

            //increase filled quan and decrease the asks

            const res_data = {
              identifier: payload.req_id,
              price: payload.price,
              filled_quantity,
            };
            console.log({ finalOrderbook: ORDERBOOK });

            console.log({ finalBTCASKS: ORDERBOOK.BTC.asks });

            publishclient.lPush('filled-order', JSON.stringify(res_data));
          } else {
            new_asks.push(0);
          }
        });

        console.log({ new_asks });

        console.log({ ORDERBOOK });

        ORDERBOOK[payload.asset].asks = new_asks;
        console.log({ ORDERBOOKAfter: ORDERBOOK });
        //  update orderbook
      }
    } else if (payload.side == 'sell') {
      //fill order, increase user wallet balance , decrease that asset , increase that asset quantity in orderbook
      const find_highest = asset.bids.reduce((p: any, c: any) => {
        console.log({ p, c });

        if (
          p[payload.asset] &&
          p[payload.asset].price > c[payload.asset].price
        ) {
          console.log({ p });

          return p;
        } else {
          console.log({ c });

          return c;
        }
      }, {});
      console.log({ find_highest });

      const high_price = (find_highest.price && find_highest.price) || 0;

      console.log({ high_price });

      if (
        ORDERBOOK[payload?.asset].bids.length == 0 ||
        payload.price > high_price
      ) {
        console.log('push to orderbook');
        const asset_name = payload.asset;
        console.log({ asset_name });

        const set_asset = {
          side: payload.side,
          price: payload.price,
          quantity: payload.quantity,
          user_id: payload.user_id,
          req_id: payload.req_id,
        };

        ORDERBOOK[payload.asset].asks.push(set_asset);

        console.log({ ORDERBOOK });
        console.log({ asks: ORDERBOOK.BTC.asks });

        const res_data = {
          identifier: payload.req_id,
          price: payload.price,
          filled_quantity: 0,
        };

        publishclient.lPush('filled-order', JSON.stringify(res_data));
      } else {
        console.log('else called');
        //  update orderbook

        let filled_quantity = 0;
        let new_bids: any = [];

        ORDERBOOK[payload.asset].bids.map((o: any) => {
          if (o.price >= payload.price) {
            //decrease the buy side of that asset quantity

            console.log('price got matched or available at higher price');
            console.log({ buyOrdr: o });

            if (o.quantity > payload.quantity) {
              filled_quantity = payload.quantity;
              //  decrease the quantity on asks

              o = {
                ...o,
                quantity: o.quantity - payload.quantity,
              };

              console.log({ o });

              new_bids.push(o);
            } else {
              filled_quantity = o.quantity;

              //decrease the quantity on asks and remove that order because either we don't have that much or exactly that much so quantity zero left on orderbook
            }
          } else {
            console.log({ o });

            new_bids.push(o);
          }
        });
        console.log({ new_bids });
        ORDERBOOK[payload.asset].bids = new_bids;
        console.log({ ORDERBOOKAfter: ORDERBOOK });
        console.log({ ORDERBOOK });

        //  update orderbook

        const res_data = {
          identifier: payload.req_id,
          price: payload.price,
          filled_quantity,
        };

        publishclient.lPush('filled-order', JSON.stringify(res_data));
      }
    }
  }
};

const cancel_order = (payload: any) => {
  //todo
  //cancel order by order by and remove from orderbook
};

const get_order = (payload: any) => {
  //todo
  //get order details by order id
};

const get_balance = (payload: any) => {
  //todo
  //get the user assets by user id
};

const get_depth = (payload: any) => {
  //todo;
};

while (1) {
  const incoming_req = await client.brPop('incoming-request', 2);

  //  const res = await client.brPop('create-order', 2);

  if (!incoming_req) {
    continue;
  }
  const parsed_req = JSON.parse(incoming_req.element);
  console.log({ parsed_req });

  //  do matching engine, check command type, do matching engine stuff and return price and identifier

  //  add engine command type checks, engine request and response type

  //  fills returned with each matched trade
  //depth grouped by price level

  //  lock funds/assets for open limit orders

  // order statuses:
  //open
  //partially_filled
  //filled
  //cancelled

  if (parsed_req.command === 'create_order') {
    create_order(parsed_req.payload);
  }
}
