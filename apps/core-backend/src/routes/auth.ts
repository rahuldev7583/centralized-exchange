import { genSalt, hash, compare } from 'bcrypt';
import express from 'express';
import { prisma } from '../../lib/prisma';
import { User } from '../types/user';
import jwt from 'jsonwebtoken';
import { userAuthMiddleware } from '../middleware/auth';
import { ZodError } from 'zod';

const router = express();
const SECRET_KEY = process.env.SECRET_KEY;

router.post('/api/auth/signup', async (req, res) => {
    const user = req.body;
    console.log({ user });

    try {
        const parsed_user = User.parse(user);

        const existing_user = await prisma.user.findFirst({
            where: {
                username: parsed_user.username,
            },
        });

        if (existing_user) {
            return res.status(404).json({ message: 'User already exists' });
        }

        const salt = await genSalt(10);
        const hashPass = await hash(parsed_user.password, salt);

        console.log({ hashPass });

        const new_user = await prisma.user.create({
            data: {
                username: parsed_user.username,
                password: hashPass,
            },
        });

        if (!SECRET_KEY) {
            return res.status(404).json('SECRET_KEY not defined');
        }

        const token = jwt.sign(new_user, SECRET_KEY, { expiresIn: '24Hr' });
        console.log({ token });

        res.status(201).json({
            message: 'User created successfully',
            authToken: token,
        });
    } catch (error: any) {
        console.log({ error });

        const errs = error instanceof ZodError ? error.issues.map((i: any) => {
            return { key: i.path[0], error: i.message };
        }) : '';

        return res.status(404).json({ message: 'Error occurred', data: errs || '' });
    }
});

router.post('/api/auth/signin', async (req, res) => {
    const user = req.body;
    console.log({ user });

    try {
        const parsed_user = User.parse(user);

        if (!user.username || !user.password) {
            return res.json('Username or password not given');
        }
        const existing_user = await prisma.user.findFirst({
            where: {
                username: parsed_user.username,
            },
        });

        if (!existing_user) {
            return res.status(401).json({ message: 'User not found' });
        }

        const pass_com = await compare(
            parsed_user.password,
            existing_user?.password,
        );

        if (!pass_com) {
            return res.status(401).json({ message: 'Invalid password' });
        }
        if (!SECRET_KEY) {
            return res.status(404).json('SECRET_KEY not defined');
        }

        const token = jwt.sign(existing_user, SECRET_KEY, { expiresIn: '24Hr' });

        res.json({ message: 'Login successful', authToken: token });
    } catch (error) {
        console.log({ error });

        const errs = error instanceof ZodError ? error.issues.map((i: any) => {
            return { key: i.path[0], error: i.message };
        }) : '';

        return res.status(404).json({ message: 'Error occurred', data: errs || '' });
    }
});

router.post('/api/auth/admin/signup', async (req, res) => {
    const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY;
    console.log({ ADMIN_SECRET });

    const secret = req.headers.x_secret_key;

    const admin = req.body;

    try {
        if (!secret || !ADMIN_SECRET || secret !== ADMIN_SECRET) {

            return res.status(404).json({ message: "ADMIN SECRET is not valid" })
        }
        const parsed_admin = User.parse(admin);

        const existing_admin = await prisma.admin.findFirst({
            where: {
                username: parsed_admin.username,
            },
        });

        if (existing_admin) {
            return res.status(404).json({ message: 'Admin already exists' });
        }

        const salt = await genSalt(10);
        const hashPass = await hash(parsed_admin.password, salt);

        const new_admin = await prisma.admin.create({
            data: {
                username: parsed_admin.username,
                password: hashPass,
            },
        });

        if (!SECRET_KEY) {
            return res.status(404).json('SECRET_KEY not defined');
        }

        const token = jwt.sign(new_admin, SECRET_KEY, { expiresIn: '24Hr' });

        //create users's assets like usd, btc etc.

        res.status(201).json({
            message: 'Admin created successfully',
            authToken: token,
        });


    } catch (error: any) {

        const errs = error instanceof ZodError ? error.issues.map((i: any) => {
            return { key: i.path[0], error: i.message };
        }) : '';

        return res.status(404).json({ message: 'Error occurred', data: errs || '' });

    }
});

router.post('/api/auth/admin/signin', async (req, res) => {
    const admin = req.body;

    try {
        const parsed_admin = User.parse(admin);

        if (!admin.username || !admin.password) {
            return res.json('Username or password not given');
        }
        const existing_admin = await prisma.admin.findFirst({
            where: {
                username: parsed_admin.username,
            },
        });

        if (!existing_admin) {
            return res.status(401).json({ message: 'Admin not found' });
        }

        const pass_com = await compare(
            parsed_admin.password,
            existing_admin?.password,
        );

        if (!pass_com) {
            return res.status(401).json({ message: 'Invalid password' });
        }
        if (!SECRET_KEY) {
            return res.status(404).json('SECRET_KEY not defined');
        }

        const token = jwt.sign(existing_admin, SECRET_KEY, { expiresIn: '24Hr' });

        res.json({ message: 'Login successful', authToken: token });
    } catch (error) {
        const errs = error instanceof ZodError ? error.issues.map((i: any) => {
            return { key: i.path[0], error: i.message };
        }) : '';

        return res.status(404).json({ message: 'Error occurred', data: errs || '' });
    }
});

router.get('/api/me', userAuthMiddleware, (req: any, res) => {
    const user = req.user;

    console.log({ user });

    res.json({ message: 'User fetched successfully', user: user });
});

export default router;
