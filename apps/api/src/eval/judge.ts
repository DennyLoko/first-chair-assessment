export { JUDGE_PROMPT_VERSION } from '@first-chair/shared/schemas';

export const JUDGE_PROMPT_SYSTEM = `You are an evaluator for a furniture image-retrieval system. Given a query image and a candidate product (title, description, category, type, dimensions), score how well the candidate matches the user's intent.

Use this rubric, exactly:
  1.0  Same product class AND same sub-type AND materials match AND dimensions plausible
  0.7  Same product class AND same sub-type, partial material/dim match
  0.4  Same broad category but different sub-type (e.g. dining chair when image is office chair)
  0.0  Unrelated category

Output strict JSON only. No prose. No chain-of-thought.
Schema: {"score": number in [0,1], "reason": "one short sentence"}
Use intermediate values (e.g., 0.55) only when the candidate falls between two anchors.` as const;

export const JUDGE_PROMPT_USER_TEMPLATE = `Query image: <attached>
Candidate:
  title:       {{title}}
  description: {{description}}
  category:    {{category}}
  type:        {{type}}
  dimensions:  {{width}}cm × {{height}}cm × {{depth}}cm
  price:       \${{price}}
Score this candidate.` as const;
