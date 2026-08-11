import { z } from 'zod';

const optionalEnvironmentValue = <T extends z.ZodType>(schema: T) =>
  z.preprocess(
    (value) => (value === '' ? undefined : value),
    schema.optional(),
  );

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    MONGODB_URI: z.string().min(1),
    REDIS_URL: z.string().min(1),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_ACCESS_TTL: z.string().default('15m'),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
    APP_WEB_URL: z.string().min(1),
    LIVEKIT_URL: optionalEnvironmentValue(z.string().url()),
    LIVEKIT_API_KEY: optionalEnvironmentValue(z.string().min(1)),
    LIVEKIT_API_SECRET: optionalEnvironmentValue(z.string().min(1)),
    HUDDLE_TOKEN_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .max(3600)
      .default(600),
    HUDDLE_PARTICIPANT_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(120),
    HUDDLE_EMPTY_GRACE_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .max(300)
      .default(30),
  })
  .superRefine((environment, context) => {
    if (
      environment.NODE_ENV === 'production' &&
      environment.LIVEKIT_API_SECRET &&
      environment.LIVEKIT_API_SECRET.length < 16
    )
      context.addIssue({
        code: 'custom',
        message:
          'Production LiveKit secrets must contain at least 16 characters',
        path: ['LIVEKIT_API_SECRET'],
      });
  });

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(
  input: Record<string, unknown>,
): Environment {
  const result = environmentSchema.safeParse(input);
  if (!result.success)
    throw new Error(
      `Invalid environment configuration: ${z.prettifyError(result.error)}`,
    );
  return result.data;
}
