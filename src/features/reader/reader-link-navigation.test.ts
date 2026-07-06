import assert from "node:assert/strict";
import test from "node:test";
import { getReaderLinkNavigation } from "./reader-link-navigation.ts";

const documentHref = "http://127.0.0.1:1420/tools/reader-ui-qa.html";

void test("classifies footnote reference and back-reference links as internal anchors", () => {
  assert.deepEqual(getReaderLinkNavigation("#user-content-fn-note", documentHref), {
    kind: "internal-anchor",
    id: "user-content-fn-note",
  });
  assert.deepEqual(getReaderLinkNavigation("#user-content-fnref-note", documentHref), {
    kind: "internal-anchor",
    id: "user-content-fnref-note",
  });
});

void test("classifies same-document heading hash links as internal anchors", () => {
  assert.deepEqual(getReaderLinkNavigation("#paragraphs-and-emphasis", documentHref), {
    kind: "internal-anchor",
    id: "paragraphs-and-emphasis",
  });
  assert.deepEqual(
    getReaderLinkNavigation(
      "http://127.0.0.1:1420/tools/reader-ui-qa.html#reader-qa-document",
      documentHref,
    ),
    {
      kind: "internal-anchor",
      id: "reader-qa-document",
    },
  );
});

void test("classifies external reader links for the default browser", () => {
  assert.deepEqual(
    getReaderLinkNavigation("https://example.com/only-md-reader-link", documentHref),
    {
      kind: "external",
      href: "https://example.com/only-md-reader-link",
    },
  );
});
