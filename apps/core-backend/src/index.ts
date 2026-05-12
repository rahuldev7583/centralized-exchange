import express from 'express';

import authRouter from './routes/auth';
import exchangeRouter from './routes/exchange';

const app = express();

//add bcrypt, zod schema, jwt
//endpoint need for exchange and orderbook
//add redis client
//create new redis db for matching engine
//add orderbook schema
//implement create order, get depth, get user balance, get order, cancel order

app.use(express.json());

app.use(authRouter);

app.get('/api/health', (req, res) => {
  console.log('health endpoints');

  res.json({ message: 'Server is running' });
});

app.listen(5000, () => {
  console.log('Server is listening on part 5000');
});
