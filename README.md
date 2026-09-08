# AgricultureConnect

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-lp24nn34)

## Configuration

This project uses Vite environment variables for Supabase.
Create a `.env` file at the repository root with:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
# Optional for local development only. Production uses the current Vercel domain.
VITE_APP_URL=http://localhost:5173
```

You can copy `.env.example` and replace the placeholders with your Supabase project values.

## Development

Run `npm run dev` and keep the terminal running while confirming an account. The confirmation
link points to the current application domain. Add both your local URL and your Vercel URL in
Supabase under Authentication > URL Configuration > Redirect URLs.
