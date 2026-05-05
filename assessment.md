# AI Full-Stack Programming Task: Image-Based Product Search

## Goal

Build a focused full-stack application that lets a user upload an image of a furniture item and receive **relevant matches** from a furniture catalog, optionally refined by a short natural-language query. We will evaluate the quality and relevance of the matches, not just whether the system returns results.

You are encouraged to use AI coding tools; ownership of the final result and all implementation decisions is entirely yours.

---

## Product Catalog

Connect to the pre-populated database using the following **read-only** connection string:

```
mongodb+srv://catalog-readonly:vcRvxWHQSKUEwd7V@catalog.sontifs.mongodb.net/catalog
```

Use the `products` collection. Each document has the following schema:

```json
{
  "title": "string",
  "description": "string",
  "category": "string",
  "type": "string",
  "price": "number",   // Price in $
  "width": "number",   // Dimensions in cm
  "height": "number",  // Dimensions in cm
  "depth": "number"    // Dimensions in cm
}
```

> You may **not** modify the database — use it and its existing indexes as they are. The catalog currently contains ~2,500 products — your implementation should use this as a starting point, but be designed to work correctly and efficiently at larger scales.

---

## Requirements

### AI Provider

Choose any frontier model provider (e.g. OpenAI, Anthropic, Google, etc.). The application must accept the user's own API key at runtime — store it **in memory only** (client-side or server-side); do not persist it to disk.

### Core Features

- **Image upload** — accept a product image from the user.
- **Product matching** — analyze the image and return ranked matches from the catalog.
- **Optional user prompt** — allow the user to add a natural-language query to narrow or adjust results.

### Admin

The client must include an **admin page or tab** — this is an internal, back-office interface, not consumer-facing. It serves as the configuration surface for the product matching functionality. Any meta-parameters that control retrieval and ranking behavior should be exposed here.

### Evaluation

Think about how you would evaluate the quality of the matching results. Document your approach in the README — and if feasible, incorporate a lightweight evaluation mechanism into the system.

### Edge Cases

Graceful handling of edge cases (e.g. unrecognizable images, API failures, no good matches) is nice to have, but less important than the quality of the core retrieval and ranking functionality.

### Principles

Apply software design principles — **KISS, DRY, separation of concerns, and clear abstractions**. Keep the architecture simple and straightforward, avoid over-engineering, and extract shared logic rather than duplicating it. Clean, readable code is valued over clever code.

---

## Stack

| Layer    | Technology           |
|----------|----------------------|
| Frontend | React + TypeScript   |
| Backend  | Node.js + TypeScript |

---

## Deliverables

### Git Repository

A Git repository containing the full solution.

### `README.md` must include:

- Clear instructions to run the system locally.
- A concise overview of the system — key design choices, considerations, and tradeoffs. Focus on the retrieval and ranking implementation.
- A list of future features or enhancements you would recommend implementing next.

### `CHANGELOG.md` must include:

- The main changes made through the development of the project, with concise reasons and motivations.
- Where relevant, include the corresponding prompts and instructions given to the coding agent.
- Particular focus on the search functionality and its implementation.

---

## Follow-Up

Be prepared to walk through a live demo, explain your implementation, and discuss how you would incorporate further features and modifications in a follow-up conversation.
