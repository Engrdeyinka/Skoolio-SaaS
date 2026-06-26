import { createEntity } from '@/lib/createEntity';
import { me } from '@/api/auth';

export const User = {
  ...createEntity('profiles'),
  me,
};
