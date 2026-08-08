// Routeur minimal basé sur le hash — pas de dépendance externe, marche hors-ligne.
const routes = {};
let notFoundHandler = () => {};

export function registerRoute(path, handler) {
  routes[path] = handler;
}

export function registerNotFound(handler) {
  notFoundHandler = handler;
}

export function navigate(path) {
  if (location.hash.slice(1) === path) {
    resolve(); // même route : on force quand même le re-rendu
  } else {
    location.hash = path;
  }
}

function resolve() {
  const path = location.hash.slice(1) || '/';
  const handler = routes[path] || notFoundHandler;
  handler();
}

export function startRouter() {
  window.addEventListener('hashchange', resolve);
  resolve();
}
