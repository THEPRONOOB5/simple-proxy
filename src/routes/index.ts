import { getBodyBuffer } from '@/utils/body';
import {
  getProxyHeaders,
  getAfterResponseHeaders,
  getBlacklistedHeaders,
} from '@/utils/headers';
import {
  createTokenIfNeeded,
  isAllowedToMakeRequest,
  setTokenHeader,
} from '@/utils/turnstile';

export default defineEventHandler(async (event) => {
  // handle cors, if applicable
  if (isPreflightRequest(event)) return handleCors(event, {});

  // parse destination URL
  const query = getQuery<{ destination?: string, referer?: string }>(event);
  const destination = query.destination;
  const referer = query.referer;

  if (!destination)
    return await sendJson({
      event,
      status: 200,
      data: {
        message: `Proxy is working as expected (v${
          useRuntimeConfig(event).version
        })`,
      },
    });

  if (!(await isAllowedToMakeRequest(event)))
    return await sendJson({
      event,
      status: 401,
      data: {
        error: 'Invalid or missing token',
      },
    });

  // read body
  const body = await getBodyBuffer(event);
  const token = await createTokenIfNeeded(event);

  // proxy
  try {
    await specificProxyRequest(event, destination, {
      blacklistedHeaders: getBlacklistedHeaders(),
      fetchOptions: {
        redirect: 'follow',
        headers: {
          ...getProxyHeaders(event.headers),
          ...(referer && { referer }), // add referer header if it exists
        },
        body,
      },
      onResponse(outputEvent, response) {
        const headers = getAfterResponseHeaders(response.headers, response.url);
        setResponseHeaders(outputEvent, headers);
        if (token) setTokenHeader(event, token);
      },
    });
  } catch (e) {
    console.log('Error fetching', e);
    throw e;
  }
});
