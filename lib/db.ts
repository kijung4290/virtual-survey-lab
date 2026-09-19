import { PrismaClient } from '@prisma/client';

/** 개발 모드 hot-reload 시 커넥션이 중복 생성되지 않도록 전역에 보관한다. */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
