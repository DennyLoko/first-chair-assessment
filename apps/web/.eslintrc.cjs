module.exports = {
  rules: {
    'no-restricted-syntax': ['error', {
      selector: "FunctionDeclaration[id.name='canonicalProductText']",
      message: "canonicalProductText must only be declared in packages/shared/src/canonical.ts. Import it; do not re-implement.",
    }],
  },
};
