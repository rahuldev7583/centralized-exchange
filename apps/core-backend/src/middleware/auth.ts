import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const SECRET_KEY = process.env.SECRET_KEY;

export const adminAuthMiddleware = (req: any, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.slice(7);

    try {
        if (!token) {
            return res.status(404).json({ message: 'Token not provided' });
        }
        if (!SECRET_KEY) {
            return res.status(404).json('SECRET_KEY not defined');
        }

        const data: any = jwt.verify(token, SECRET_KEY);

        if (data.user_type == "Admin") {
            req.user = data.admin_id;
            next();
        } else {
            console.log('Admin restricted');
            return res.status(404).json({ message: 'Admin restricted' });
        }
    } catch (error) {
        console.log({ error });

        console.log('invalid or expired token');

        return res.status(404).json({ message: 'Invalid or expired token' });
    }
};


export const userAuthMiddleware = (req: any, res: Response, next: NextFunction) => {
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

        if (data.user_type == "User") {
            req.user = data.user_id;
            next();
        } else {
            console.log('User restricted');
            return res.status(404).json({ message: 'User restricted' });
        }
    } catch (error) {
        console.log({ error });

        console.log('invalid or expired token');

        return res.status(404).json({ message: 'Invalid or expired token' });
    }
};
