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

while (1) {
  const res = await client.brPop('create-order', 2);

  if (!res) {
    continue;
  }
  const parsed_res = JSON.parse(res.element);
  console.log({ parsed_res });

  //  do matching engine, check command type, do matching engine stuff and return price and identifier

  const filled_quantity = 10;
  const res_data = {
    identifier: parsed_res.req_id,
    price: parsed_res.price,
    filled_quantity,
  };

  publishclient.lPush('filled-order ', JSON.stringify(res_data));
}
