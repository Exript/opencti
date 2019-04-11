import { assoc, map } from 'ramda';
import uuid from 'uuid/v4';
import { delEditContext, setEditContext } from '../database/redis';
import {
  createRelation,
  deleteEntityById,
  deleteRelationById,
  updateAttribute,
  getById,
  dayFormat,
  monthFormat,
  yearFormat,
  notify,
  now,
  paginate,
  takeWriteTx,
  timeSeries,
  getObject,
  prepareString,
  getSingleValueNumber,
  prepareDate
} from '../database/grakn';
import {
  deleteEntity,
  index,
  paginate as elPaginate
} from '../database/elasticSearch';

import { BUS_TOPICS } from '../config/conf';
import {
  findAll as relationFindAll,
  search as relationSearch
} from './stixRelation';

export const findAll = args => elPaginate('stix-domain-entities', args);
/* paginate(
    `match $x isa ${args.type ? args.type : 'Stix-Domain-Entity'}`,
    args,
    false
  ); */

export const search = args => elPaginate('stix-domain-entities', args);
/* paginate(
   `match $x isa ${args.type ? args.type : 'Stix-Domain-Entity'};
   $x has name $name;
   $x has alias $alias;
   { $name contains "${prepareString(args.search)}"; } or
   { $alias contains "${prepareString(args.search)}"; }`,
   args,
   false
 ); */

export const stixDomainEntitiesTimeSeries = args =>
  timeSeries(
    `match $x isa ${args.type ? args.type : 'Stix-Domain-Entity'}`,
    args
  );

export const stixDomainEntitiesNumber = args => ({
  count: getSingleValueNumber(
    `match $x isa ${args.type ? args.type : 'Stix-Domain-Entity'};
    ${
      args.endDate
        ? `$x has created_at $date;
    $date < ${prepareDate(args.endDate)};`
        : ''
    }
    get;
    count;`
  ),
  total: getSingleValueNumber(
    `match $x isa ${args.type ? args.type : 'Stix-Domain-Entity'};
    get;
    count;`
  )
});

export const findById = stixDomainEntityId => getById(stixDomainEntityId);

export const findByStixId = args =>
  paginate(
    `match $x isa ${args.type ? args.type : 'Stix-Domain-Entity'};
    $x has stix_id "${prepareString(args.stix_id)}"`,
    args,
    false
  );

export const findByName = args =>
  paginate(
    `match $x isa ${args.type ? args.type : 'Stix-Domain-Entity'};
    $x has name "${prepareString(args.name)}"`,
    args,
    false
  );

export const findByExternalReference = args =>
  paginate(
    `match $x isa ${args.type ? args.type : 'Stix-Domain-Entity'};
     $rel(external_reference:$externalReference, so:$x) isa external_references;
     $externalReference id "${prepareString(args.externalReferenceId)}"`,
    args,
    false
  );

export const createdByRef = stixDomainEntityId =>
  getObject(
    `match $i isa Identity; 
    $rel(creator:$i, so:$x) isa created_by_ref; 
    $x id ${stixDomainEntityId}; get $i, $rel; offset 0; limit 1;`,
    'i',
    'rel'
  );

export const killChainPhases = (stixDomainEntityId, args) =>
  paginate(
    `match $k isa Kill-Chain-Phase; 
    $rel(kill_chain_phase:$k, phase_belonging:$x) isa kill_chain_phases; 
    $x id ${stixDomainEntityId}`,
    args,
    false
  );

export const markingDefinitions = (stixDomainEntityId, args) =>
  paginate(
    `match $m isa Marking-Definition; 
    $rel(marking:$m, so:$x) isa object_marking_refs; 
    $x id ${stixDomainEntityId}`,
    args,
    false
  );

export const reports = (stixDomainEntityId, args) =>
  paginate(
    `match $r isa Report; 
    $rel(knowledge_aggregation:$r, so:$x) isa object_refs; 
    $x id ${stixDomainEntityId}`,
    args
  );

export const reportsTimeSeries = (stixDomainEntityId, args) =>
  timeSeries(
    `match $x isa Report; 
    $rel(knowledge_aggregation:$x, so:$so) isa object_refs; 
    $so id ${stixDomainEntityId}`,
    args
  );

export const externalReferences = (stixDomainEntityId, args) =>
  paginate(
    `match $e isa External-Reference; 
    $rel(external_reference:$e, so:$x) isa external_references; 
    $x id ${stixDomainEntityId}`,
    args,
    false
  );

export const stixRelations = (stixDomainEntityId, args) => {
  const finalArgs = assoc('fromId', stixDomainEntityId, args);
  if (finalArgs.search && finalArgs.search.length > 0) {
    return relationSearch(finalArgs);
  }
  return relationFindAll(finalArgs);
};

export const stixDomainEntityExportPush = async (
  user,
  stixDomainEntityId,
  exportId,
  rawData
) => {
  await updateAttribute(exportId, { key: 'raw_data', value: [rawData] });
  await updateAttribute(exportId, { key: 'object_status', value: [1] });
  return getById(stixDomainEntityId).then(stixDomainEntity => {
    notify(BUS_TOPICS.StixDomainEntity.EDIT_TOPIC, stixDomainEntity, user);
    return true;
  });
};

export const addStixDomainEntity = async (user, stixDomainEntity) => {
  const wTx = await takeWriteTx();
  const stixDomainEntityIterator = await wTx.query(`insert $stixDomainEntity isa ${
    stixDomainEntity.type
  },
    has entity_type "${prepareString(stixDomainEntity.type.toLowerCase())}",
    has stix_id "${
      stixDomainEntity.stix_id
        ? prepareString(stixDomainEntity.stix_id)
        : `${prepareString(stixDomainEntity.type.toLowerCase())}--${uuid()}`
    }",
    has stix_label "",
    has alias "",
    has name "${prepareString(stixDomainEntity.name)}",
    has description "${prepareString(stixDomainEntity.description)}",
    has created ${
      stixDomainEntity.created ? prepareDate(stixDomainEntity.created) : now()
    },
    has modified ${
      stixDomainEntity.modified ? prepareDate(stixDomainEntity.modified) : now()
    },
    has revoked false,
    has created_at ${now()},
    has created_at_day "${dayFormat(now())}",
    has created_at_month "${monthFormat(now())}",
    has created_at_year "${yearFormat(now())}",      
    has updated_at ${now()};
  `);
  const createStixDomainEntity = await stixDomainEntityIterator.next();
  const createdStixDomainEntityId = await createStixDomainEntity
    .map()
    .get('stixDomainEntity').id;

  if (stixDomainEntity.createdByRef) {
    await wTx.query(
      `match $from id ${createdStixDomainEntityId};
      $to id ${stixDomainEntity.createdByRef};
      insert (so: $from, creator: $to)
      isa created_by_ref;`
    );
  }

  if (stixDomainEntity.markingDefinitions) {
    const createMarkingDefinition = markingDefinition =>
      wTx.query(
        `match $from id ${createdStixDomainEntityId}; 
        $to id ${markingDefinition}; 
        insert (so: $from, marking: $to) isa object_marking_refs;`
      );
    const markingDefinitionsPromises = map(
      createMarkingDefinition,
      stixDomainEntity.markingDefinitions
    );
    await Promise.all(markingDefinitionsPromises);
  }

  await wTx.commit();

  return getById(createdStixDomainEntityId).then(created => {
    index('stix-domain-entities', 'stix_domain_entity', created);
    return notify(BUS_TOPICS.StixDomainEntity.ADDED_TOPIC, created, user);
  });
};

export const stixDomainEntityDelete = stixDomainEntityId => {
  deleteEntity(
    'stix-domain-entities',
    'stix_domain_entity',
    stixDomainEntityId
  );
  return deleteEntityById(stixDomainEntityId);
};

export const stixDomainEntityAddRelation = (user, stixDomainEntityId, input) =>
  createRelation(stixDomainEntityId, input).then(relationData => {
    notify(BUS_TOPICS.StixDomainEntity.EDIT_TOPIC, relationData.node, user);
    return relationData;
  });

export const stixDomainEntityDeleteRelation = (
  user,
  stixDomainEntityId,
  relationId
) =>
  deleteRelationById(stixDomainEntityId, relationId).then(relationData => {
    notify(BUS_TOPICS.StixDomainEntity.EDIT_TOPIC, relationData.node, user);
    return relationData;
  });

export const stixDomainEntityCleanContext = (user, stixDomainEntityId) => {
  delEditContext(user, stixDomainEntityId);
  return getById(stixDomainEntityId).then(stixDomainEntity =>
    notify(BUS_TOPICS.StixDomainEntity.EDIT_TOPIC, stixDomainEntity, user)
  );
};

export const stixDomainEntityEditContext = (
  user,
  stixDomainEntityId,
  input
) => {
  setEditContext(user, stixDomainEntityId, input);
  return getById(stixDomainEntityId).then(stixDomainEntity =>
    notify(BUS_TOPICS.StixDomainEntity.EDIT_TOPIC, stixDomainEntity, user)
  );
};

export const stixDomainEntityEditField = (user, stixDomainEntityId, input) =>
  updateAttribute(stixDomainEntityId, input).then(stixDomainEntity => {
    index('stix-domain-entities', 'stix_domain_entity', stixDomainEntity);
    return notify(
      BUS_TOPICS.StixDomainEntity.EDIT_TOPIC,
      stixDomainEntity,
      user
    );
  });
