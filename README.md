# Compliance Tool

A Next.js 14 application that evaluates compliance documents against reference standards using AWS Bedrock AI (with MiniMax M2.5 as fallback). Uses Prisma with SQLite for local development.

## Prerequisites

- Node.js 18+
- npm or yarn
- AWS account (for Bedrock) OR MiniMax API key (for fallback)

## Quick Start

### 1. Clone and Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your configuration:

```env
# Database (SQLite for local development)
DATABASE_URL="file:./prisma/dev.db"

# AWS (required for Bedrock)
AWS_REGION="ap-southeast-1"
AWS_ACCESS_KEY_ID="your-aws-access-key"
AWS_SECRET_ACCESS_KEY="your-aws-secret-key"
S3_BUCKET_NAME="your-bucket-name"

# MiniMax Fallback (optional - used if Bedrock fails)
MINIMAX_API_KEY="your-minimax-api-key"

# App Settings
NEXT_PUBLIC_APP_URL="http://localhost:3000"
MAX_FILE_SIZE_MB=10
```

### 3. Set Up Database

```bash
# Generate Prisma client
npm run db:generate

# Push schema to database
npm run db:push
```

### 4. Start Development Server

```bash
npm run dev
```

The app will be available at `http://localhost:3000`.

## Docker Setup

For a production-like environment with PostgreSQL:

```bash
# Start containers
docker-compose up -d

# Generate Prisma client (inside container)
docker-compose exec app npm run db:generate

# Push schema to database
docker-compose exec app npm run db:push
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:push` | Push schema to database |
| `npm run db:studio` | Open Prisma Studio |

## Features

- **Document Upload**: Upload reference and submission documents (PDF, DOCX, TXT)
- **AI-Powered Evaluation**: Uses AWS Bedrock (Claude) with MiniMax M2.5 fallback
- **Requirement Extraction**: Automatically extracts compliance requirements from reference documents
- **Scoring System**: Weighted scoring based on requirement criticality (CRITICAL, MAJOR, MINOR)
- **Results Dashboard**: View detailed evaluation results with evidence and explanations

## API Endpoints

- `POST /api/reference` - Upload reference document
- `GET /api/reference` - List all reference documents
- `POST /api/upload` - Upload submission document
- `POST /api/evaluation` - Start evaluation
- `GET /api/evaluation/[id]` - Get evaluation status and results

## LLM Providers

### Primary: AWS Bedrock (Claude)

Configure via environment variables:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`
- `BEDROCK_MODEL_ID`

### Fallback: MiniMax M2.5

If Bedrock fails, the system automatically falls back to MiniMax M2.5.

Configure via:
- `MINIMAX_API_KEY`

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Database**: SQLite (local) / PostgreSQL (production)
- **ORM**: Prisma
- **AI**: AWS Bedrock / MiniMax
- **Styling**: Tailwind CSS
- **Validation**: Zod
