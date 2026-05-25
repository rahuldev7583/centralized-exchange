import { genSalt, hash, compare } from 'bcrypt';
import express from 'express';
import { prisma } from '../../lib/prisma';
import { User } from '../types/user';
import jwt from 'jsonwebtoken';
import { authMiddleware } from '../middleware/auth';

const router = express();
const SECRET_KEY = process.env.SECRET_KEY;

router.post('/api/signup', async (req, res) => {
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
    console.log('error');

    console.log({ error });

    return res.status(404).json({ message: 'error occurred' });
  }
});

router.post('/api/signin', async (req, res) => {
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
    console.log('error');
  }
});

router.get('/api/me', authMiddleware, (req: any, res) => {
  const user = req.user;

  console.log({ user });

  res.json({ message: 'User fetched successfully', user: user });
});

export default router;
