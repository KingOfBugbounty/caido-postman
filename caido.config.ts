export default {
  id: "caido-postman",
  name: "Caido Postman Integration",
  version: "1.0.0",
  description: "Filter Caido history by domain and export authenticated requests to Postman",
  author: {
    name: "@OFJAAAH",
    email: "contact@ofjaaah.com",
    url: "https://github.com/OFJAAAH"
  },
  plugins: [
    {
      kind: "frontend",
      id: "caido-postman-frontend",
      name: "Postman Frontend",
      root: "src/frontend",
      backend: {
        id: "caido-postman-backend"
      }
    },
    {
      kind: "backend",
      id: "caido-postman-backend",
      name: "Postman Backend",
      root: "src/backend"
    }
  ]
};
