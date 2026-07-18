export function restorePassThroughForExactSelfRewrite<T extends Response>(
  response: T,
  requestUrl: URL,
): T {
  const rewrite = response.headers.get("x-middleware-rewrite");

  if (rewrite && new URL(rewrite).href === requestUrl.href) {
    response.headers.delete("x-middleware-rewrite");
    response.headers.set("x-middleware-next", "1");
  }

  return response;
}
