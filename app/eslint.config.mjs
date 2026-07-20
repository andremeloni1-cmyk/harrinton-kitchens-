import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  { ignores: [".next/**", "node_modules/**"] },
  ...nextCoreWebVitals,
  {
    rules: {
      // The Next 16 hooks plugin introduced this rule. It flags our existing,
      // intentional "load data on mount" effects (useEffect(() => { load(); })).
      // Keep it visible as a warning rather than failing the build.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default eslintConfig;
