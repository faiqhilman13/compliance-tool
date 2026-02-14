# Agent Guidelines for Compliance Tool

## Project Overview

This is a Next.js 14 application with TypeScript that evaluates compliance documents against reference standards using AWS Bedrock AI. It uses Prisma with SQLite for data persistence.

## Build & Development Commands

```bash
# Development
npm run dev              # Start Next.js development server

# Build & Production
npm run build            # Build for production
npm run start            # Start production server

# Code Quality
npm run lint             # Run ESLint
npm run typecheck        # Run TypeScript type checking (tsc --noEmit)

# Database
npm run db:generate      # Generate Prisma client
npm run db:migrate       # Run Prisma migrations
npm run db:push          # Push schema to database
npm run db:studio        # Open Prisma Studio
```

**Note:** This project does not have a test suite configured. Before adding tests, install a testing framework (Vitest recommended for Next.js).

## Code Style Guidelines

### General Principles

- Use TypeScript with strict mode enabled
- Prefer explicit typing over `any`
- Use Zod for runtime validation of API inputs
- Keep functions small and focused

### Imports & Path Aliases

- Use the `@/*` alias for imports: `import { foo } from '@/lib/foo'`
- Order imports: external libs → internal aliases → relative
- Group related utilities in `src/lib/`
- Define shared types in `src/types/`

```typescript
// Good
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { parseDocument } from '@/lib/parser';
import type { Criticality } from '@/types';

// Avoid
import { prisma } from '../lib/db';
```

### Naming Conventions

- **Files**: kebab-case for utilities (`parser.ts`), kebab-case for routes (`evaluation.ts`)
- **Components**: PascalCase (`HomePage.tsx`)
- **Interfaces/Types**: PascalCase (`interface EvaluationResult`)
- **Constants**: SCREAMING_SNAKE_CASE for config objects (`CRITICALITY_WEIGHTS`)
- **Functions/Variables**: camelCase

### TypeScript Best Practices

- Enable strict mode in tsconfig.json
- Avoid `any`, use `unknown` when type is uncertain
- Use type inference when obvious, explicit types for function signatures
- Export types that are shared across modules

```typescript
// Good - explicit types for public API
export async function POST(request: NextRequest): Promise<NextResponse> {
  const body = await request.json();
  // ...
}

// Good - inferred types for internal helpers
const getScoreColor = (score: number | null) => {
  if (score === null) return 'text-gray-500';
  // ...
};
```

### React Components

- Use `'use client'` directive for client-side components
- Define interfaces for props and state inline in the same file
- Use functional components with hooks
- Use `clsx` for conditional class merging

```typescript
'use client';

import { useState, useEffect } from 'react';
import clsx from 'clsx';

interface Props {
  title: string;
}

export default function Component({ title }: Props) {
  const [state, setState] = useState<string>('');
  
  // ...
}
```

### API Routes (Next.js App Router)

- Export named functions: `GET`, `POST`, `PUT`, `DELETE`
- Use try/catch for error handling
- Return appropriate HTTP status codes
- Validate inputs with Zod schemas before processing

```typescript
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = someSchema.safeParse(body);
    
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.issues },
        { status: 400 }
      );
    }
    
    // Process request...
    return NextResponse.json(result);
  } catch (error) {
    console.error('Handler error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### Error Handling

- Always log errors with context: `console.error('Action failed:', error)`
- Return user-friendly error messages in API responses
- Use meaningful error messages: `'Reference document not found'` not `'Error'`
- Handle known error cases explicitly before generic catch

### Database (Prisma)

- Use Prisma client via `@/lib/db`
- Include related data with `include` option
- Use `select` to limit returned fields when possible
- Validate data with Zod before database operations

```typescript
const evaluation = await prisma.evaluation.findUnique({
  where: { id: evaluationId },
  include: {
    reference: {
      include: {
        requirements: true,
      },
    },
    submittedFiles: true,
  },
});
```

### Schema Validation (Zod)

- Define schemas in `src/lib/schemas.ts`
- Export inferred types using `z.infer<typeof schema>`
- Use meaningful validation messages

```typescript
export const createEvaluationSchema = z.object({
  referenceId: z.string().min(1),
  fileNames: z.array(z.string().min(1)).min(1).max(5),
  fileKeys: z.array(z.string().min(1)).min(1).max(5),
}).refine(data => data.fileNames.length === data.fileKeys.length, {
  message: "fileNames and fileKeys must have the same length",
});

export type CreateEvaluationInput = z.infer<typeof createEvaluationSchema>;
```

### CSS & Styling

- Use Tailwind CSS for all styling
- Use `clsx` or template literals for conditional classes
- Keep custom CSS in `src/app/globals.css` for global styles

### File Organization

```
src/
├── app/                    # Next.js App Router pages & API routes
│   ├── api/               # API endpoints
│   │   ├── evaluation/
│   │   ├── reference/
│   │   └── upload/
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── lib/                    # Server-side utilities
│   ├── db.ts              # Prisma client
│   ├── evaluation.ts      # Evaluation logic
│   ├── parser.ts          # Document parsing
│   ├── queue.ts           # Job queue
│   ├── s3.ts              # S3 operations
│   ├── schemas.ts         # Zod schemas
│   └── bedrock.ts          # AWS Bedrock integration
├── types/                  # Shared TypeScript types
└── types/index.ts
```

### Environment Variables

- Copy `.env.example` to `.env.local` for development
- Never commit secrets to version control
- Required variables:
  - `DATABASE_URL` - Prisma database connection
  - `AWS_ACCESS_KEY_ID` - AWS credentials
  - `AWS_SECRET_ACCESS_KEY` - AWS credentials
  - `AWS_REGION` - AWS region
  - `S3_BUCKET_NAME` - S3 bucket for file storage

## Running Code Quality Checks

Before submitting changes, always run:

```bash
npm run lint    # Check for ESLint errors
npm run typecheck  # TypeScript type checking
```

Fix any errors before committing.
