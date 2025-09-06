import { json } from "@remix-run/node";
import { unauthenticated } from "../shopify.server";

const QUERY_DRAFT_ORDERS_SEARCH = `#graphql
  query GetDraftOrders($q: String!) {
    draftOrders(first: 1, query: $q, sortKey: UPDATED_AT, reverse: true) {
      nodes {
        id
        name
        createdAt
        updatedAt
        status
        customer { id , email, displayName }
        lineItems(first: 10) {
          nodes {
            id
            title
            quantity
            originalUnitPriceSet { shopMoney { amount currencyCode } }
            variant { id image { url } }
          }
        }
      }
    }
  }
`;


export async function loader({ request, params }) {
  try {
    // 1) API key opcional para seguridad
    const apiKey = process.env.INTERNAL_API_KEY;
    const hdr = request.headers.get("x-api-key") || request.headers.get("X-API-Key");
    if (apiKey && hdr !== apiKey) {
      return json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    // 2) Extraer customer ID y shop
    const id = params.id;
    const url = new URL(request.url);
    const shop = url.searchParams.get("shop");

    if (!shop) {
      return json({ ok: false, error: 'Falta query param "shop"' }, { status: 400 });
    }
    if (!id || !/^\d+$/.test(id)) {
      return json({ ok: false, error: "Customer ID inválido" }, { status: 400 });
    }

    // 3) Construir query de búsqueda
    const q = `status:open customer_id:${id}`;

    // 4) Cliente Admin GraphQL
    const { admin } = await unauthenticated.admin(shop);

    // 5) Ejecutar la consulta
    const resp = await admin.graphql(QUERY_DRAFT_ORDERS_SEARCH, { variables: { q } });
    const data = await resp.json();

    const node = data?.data?.draftOrders?.nodes?.[0];
    if (node) {
      return json({ ok: true, draftOrder: node }, { status: 200 });
    }

    return json({
      ok: false,
      error: `No hay draft order OPEN para customer_id:${id}`
    }, { status: 404 });

  } catch (err) {
    console.error("[latest-by-customer] error:", err?.message || err);
    return json({
      ok: false,
      error: err?.message || "Internal error",
      details: err?.response?.data ?? null
    }, { status: 500 });
  }
}
