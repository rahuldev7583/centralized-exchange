import express from 'express';

import authRouter from './routes/auth';
import exchangeRouter from './routes/exchange';

const app = express();

//add bcrypt, zod schema, jwt
//endpoint need for exchange and orderbook
//add redis client

//go through readme, understand flow and create diagram
//implement redis for both core and engine

//add required schema

//implement create order, get depth, get user balance, get order, cancel order

import { createClient } from 'redis';
import { authMiddleware } from './middleware/auth';

export const client = createClient();

client.on('error', (err: any) =>
  console.log({ msg: 'Redis client error', err }),
);

client.connect();
console.log('Connected');

app.use(express.json());

app.get('/api/health', (req, res) => {
  console.log('health endpoints');

  res.json({ message: 'Server is running' });
});

app.use(authRouter);
app.use(authMiddleware, exchangeRouter);

app.listen(5000, () => {
  console.log('Server is listening on part 5000');
});
