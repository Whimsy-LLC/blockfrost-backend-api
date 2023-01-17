import { FastifyInstance, FastifyRequest } from 'fastify';
import { isUnpaged } from '../../../utils/routes';
import { toJSONStream } from '../../../utils/string-utils';
import * as ResponseTypes from '../../../types/responses/accounts';
import * as QueryTypes from '../../../types/queries/accounts';
import { getSchemaForEndpoint } from '@blockfrost/openapi';
import { getDbSync } from '../../../utils/database';
import { handle400Custom, handle404 } from '../../../utils/error-handler';
import { validateStakeAddress } from '../../../utils/validation';
import { SQLQuery } from '../../../sql';

async function route(fastify: FastifyInstance) {
  fastify.route({
    url: '/accounts/:stake_address/withdrawals',
    method: 'GET',
    schema: getSchemaForEndpoint('/accounts/{stake_address}/withdrawals'),
    handler: async (request: FastifyRequest<QueryTypes.RequestAccountsQueryParameters>, reply) => {
      const clientDbSync = await getDbSync(fastify);

      try {
        // Check stake address format. Return 400 on non-valid stake address
        const isStakeAddressValid = validateStakeAddress(request.params.stake_address);

        if (!isStakeAddressValid) {
          clientDbSync.release();
          return handle400Custom(reply, 'Invalid or malformed stake address format.');
        }

        const query404 = await clientDbSync.query<QueryTypes.ResultFound>(
          SQLQuery.get('accounts_404'),
          [request.params.stake_address],
        );

        if (query404.rows.length === 0) {
          clientDbSync.release();
          return handle404(reply);
        }

        const unpaged = isUnpaged(request);
        const { rows }: { rows: ResponseTypes.AccountWithdrawalsAndMirs } = unpaged
          ? await clientDbSync.query<QueryTypes.AccountWithdrawalsAndMirs>(
              SQLQuery.get('accounts_stake_address_withdrawals_unpaged'),
              [request.query.order, request.params.stake_address],
            )
          : await clientDbSync.query<QueryTypes.AccountWithdrawalsAndMirs>(
              SQLQuery.get('accounts_stake_address_withdrawals'),
              [
                request.query.order,
                request.query.count,
                request.query.page,
                request.params.stake_address,
              ],
            );

        clientDbSync.release();

        if (rows.length === 0) {
          return reply.send([]);
        }

        if (unpaged) {
          // Use of Reply.raw functions is at your own risk as you are skipping all the Fastify logic of handling the HTTP response
          // https://www.fastify.io/docs/latest/Reference/Reply/#raw
          reply.raw.writeHead(200, { 'Content-Type': 'application/json' });
          toJSONStream(rows, reply.raw);
          return reply.raw.end();
        } else {
          return reply.send(rows);
        }
      } catch (error) {
        if (clientDbSync) {
          clientDbSync.release();
        }
        throw error;
      }
    },
  });
}

export default route;
