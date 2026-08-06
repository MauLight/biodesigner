# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# Conventions

- No promise chaining (`.then()`/`.catch()`/`.finally()`). Use `async`/`await` with `try`/`catch` instead.
- No inline functions in JSX props (e.g. `onClick={() => ...}`). Define a named handler and pass it by reference.
