import { FastifyInstance, FastifyRequest } from 'fastify';
import { isUnpaged } from '../../../../../utils/routes';
import * as QueryTypes from '../../../../../types/queries/metadata';
import * as ResponseTypes from '../../../../../types/responses/metadata';
import { getDbSync } from '../../../../../utils/database';
import { handle400Custom, handle404 } from '../../../../../utils/error-handler';
import { validatePositiveInRangeSignedBigInt } from '../../../../../utils/validation';
import { SQLQuery } from '../../../../../sql';
import { getSchemaForEndpoint } from '@blockfrost/openapi';
import { toJSONStream } from '../../../../../utils/string-utils';

async function route(fastify: FastifyInstance) {
  fastify.route({
    url: '/metadata/txs/labels/:label/cbor',
    method: 'GET',
    schema: getSchemaForEndpoint('/metadata/txs/labels/{label}/cbor'),
    handler: async (request: FastifyRequest<QueryTypes.RequestLabelParameters>, reply) => {
      const clientDbSync = await getDbSync(fastify);

      try {
        if (!validatePositiveInRangeSignedBigInt(request.params.label)) {
          clientDbSync.release();
          return handle400Custom(reply, 'Missing, out of range or malformed label.');
        }

        const unpaged = isUnpaged(request);
        const { rows }: { rows: ResponseTypes.TxMetadataLabelNumberCbor } = unpaged
          ? await clientDbSync.query<QueryTypes.MetadataTxLabelCbor>(
              SQLQuery.get('metadata_txs_labels_label_cbor_unpaged'),
              [request.query.order, request.params.label],
            )
          : await clientDbSync.query<QueryTypes.MetadataTxLabelCbor>(
              SQLQuery.get('metadata_txs_labels_label_cbor'),
              [request.query.order, request.query.count, request.query.page, request.params.label],
            );

        clientDbSync.release();

        if (rows.length === 0) {
          return handle404(reply);
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
