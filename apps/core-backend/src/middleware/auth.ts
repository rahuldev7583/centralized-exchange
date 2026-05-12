import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const SECRET_KEY = process.env.SECRET_KEY;

export const authMiddleware = (req: any, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.slice(7);

  try {
    console.log({ token });
    if (!token) {
      return res.status(404).json({ message: 'Token not provided' });
    }
    if (!SECRET_KEY) {
      return res.status(404).json('SECRET_KEY not defined');
    }

    const data: any = jwt.verify(token, SECRET_KEY);
    console.log({ data });

    req.user = data.username;

    next();
  } catch (error) {
    console.log({ error });

    console.log('invalid or expired token');

    return res.status(404).json({ message: 'Invalid or expired token' });
  }
};
