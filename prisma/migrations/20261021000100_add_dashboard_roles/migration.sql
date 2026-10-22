-- Keep existing roles so old users remain compatible.
ALTER TYPE "Role" ADD VALUE 'STUDENT';
ALTER TYPE "Role" ADD VALUE 'MENTOR';
