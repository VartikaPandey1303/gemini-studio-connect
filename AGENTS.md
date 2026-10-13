<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- All money maths lives in `src/lib/rules.ts` (pure, tested in `rules.test.ts`); UI and AI never compute amounts.
- AI calls go through server functions in `src/lib/ai.functions.ts`; `src/lib/ai.ts` falls back to `ai-local.ts` rules so the demo never breaks offline.
- App state is one localStorage-persisted store in `src/lib/store.tsx` (includes the demo timeline); screens are views inside `/` because the demo switches roles in one page.
