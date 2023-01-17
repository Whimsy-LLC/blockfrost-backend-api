import { FastifyInstance, FastifyRequest } from 'fastify';
import { isUnpaged } from '../../utils/routes';
import * as QueryTypes from '../../types/queries/scripts';
import * as ResponseTypes from '../../types/responses/scripts';
import { getDbSync } from '../../utils/database';
import { SQLQuery } from '../../sql';
import { getSchemaForEndpoint } from '@blockfrost/openapi';
import { toJSONStream } from '../../utils/string-utils';

async function route(fastify: FastifyInstance) {
  fastify.route({
    url: '/scripts',
    method: 'GET',
    schema: getSchemaForEndpoint('/scripts'),
    handler: async (request: FastifyRequest<QueryTypes.RequestParameters>, reply) => {
      const clientDbSync = await getDbSync(fastify);

      try {
        const unpaged = isUnpaged(request);
        const { rows }: { rows: ResponseTypes.Scripts } = unpaged
          ? await clientDbSync.query<QueryTypes.Scripts>(SQLQuery.get('scripts_unpaged'), [
              request.query.order,
            ])
          : await clientDbSync.query<QueryTypes.Scripts>(SQLQuery.get('scripts'), [
              request.query.order,
              request.query.count,
              request.query.page,
            ]);

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
