# Campus Delight Webapp

I'm building a web app for a special kind of restaurant called Campus Delight. Keep the canvas until I provide you with the product requirement document.

This project was built with [Lovable](https://lovable.dev).

## Authentication configuration

Keep Auth CAPTCHA protection disabled in the hosted Supabase project's Authentication settings. Sign-in and sign-up submit directly to Supabase; email confirmation and account validation still apply. The local configuration also disables CAPTCHA. Hosted settings must be updated separately before deploying this version.

Feed Someone looks up a complete Foodie ID immediately and uses Paystack for checkout.
Its database changes await business approval in `drizzle/proposed/feed_someone.sql`.
See [gifting rollout notes](drizzle/proposed/feed_someone.md) before enabling checkout.

**Live app**: https://campus-delight-webapp.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/26e23df5-ee2e-4a9c-9175-3fb980bfd92d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
