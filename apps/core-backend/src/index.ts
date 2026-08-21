import express from 'express';

import authRouter from './routes/auth';
import exchangeRouter from './routes/exchange';
import assetRouter from "./routes/asset";
import walletRouter from "./routes/wallet"
import { createClient } from 'redis';
import { userAuthMiddleware } from './middleware/auth';

const app = express();
export const BACKEND_ID = crypto.randomUUID();

//add bcrypt, zod schema, jwt
//endpoint need for exchange and orderbook
//add redis client

//go through readme, understand flow and create diagram
//implement redis for both core and engine

//add required schema

//implement create order, get depth, get user balance, get order, cancel order



export const client = createClient();

client.on('error', (err: any) =>
    console.log({ msg: 'Redis client error', err }),
);

client.connect();
console.log('Connected');

export async function get_identifier() {
    const res_client = createClient();

    res_client.on('error', (err: any) =>
        console.log({ msg: 'Redis client error', err }),
    );

    res_client.connect();
    console.log('Connected');
    const queue_res = await res_client.brPop(`response-queue-${BACKEND_ID}`, 2);

    console.log('wait for identifier');

    console.log({ queue_res });
    return queue_res;
}

app.use(express.json());

app.get('/api/health', (req, res) => {
    console.log('health endpoints');

    res.json({ message: 'Server is running' });
});

app.use(authRouter);
app.use(assetRouter);
app.use(userAuthMiddleware, walletRouter);
app.use(userAuthMiddleware, exchangeRouter);

app.listen(5000, () => {
    console.log('Server is listening on part 5000');
});
