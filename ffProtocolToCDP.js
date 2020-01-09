
export function ffProtocolToCDP(ffProtocolText) {
  return _ffProtocolToCDP.call({}, ffProtocolText);
}

function _ffProtocolToCDP(ffProtocolText) {
  const t = {
    String: {type: 'string'},
    Number: {type: 'number'},
    Boolean: {type: 'boolean'},
    Null: {type: '<null>', description: 'NULL'},
    Undefined: {type: '<undefined>', description: 'UNDEFINED'},
    Any: {type: 'object', description: 'anything'},
    Enum: (values) => ({
      type: typeof values[0],
      description: 'Allowed values: ' + values.map(v => `<code>${v}</code>`).join(', '),
    }),
    Nullable: smth => ({
      __of__: smth,
      nullable: true,
    }),
    Optional: smth => ({
      optional: true,
      __of__: smth,
    }),
    Array: smth => ({
      type: 'array',
      items: smth,
    }),
    Recursive: (types, name) => ({
      $ref: name,
    }),
  };
  const checkScheme = () => {};
  // filter out all "import" statements.
  ffProtocolText = ffProtocolText.split('\n').filter(line => !line.includes('ChromeUtils.import')).join('\n');
  eval(ffProtocolText);
  const ffProtocol = this.protocol.domains;
  console.log(ffProtocol);

  const typeToTypeName = new Map();
  for (const [domainName, domain] of Object.entries(ffProtocol)) {
    for (const [typeName, type] of Object.entries(domain.types || {}))
      typeToTypeName.set(type, domainName + '.' + typeName);
  }

  const cdpDomains = [];
  for (const [domainName, domain] of Object.entries(ffProtocol)) {
    const cdpTypes = [];
    for (const [typeName, type] of Object.entries(domain.types || {})) {
      cdpTypes.push({
        id: typeName,
        type: 'object',
        properties: Object.entries(type).map(([name, value]) => describeProperty(name, value)),
      });
    }
    const cdpCommands = [];
    for (const [methodName, method] of Object.entries(domain.methods || {})) {
      cdpCommands.push({
        name: methodName,
        parameters: Object.entries(method.params || {}).map(([name, value]) => describeProperty(name, value)),
        returns: Object.entries(method.returns || {}).map(([name, value]) => describeProperty(name, value)),
      });
    }

    const cdpEvents = [];
    for (const [eventName, event] of Object.entries(domain.events || {})) {
      cdpEvents.push({
        name: eventName,
        parameters: Object.entries(event || {}).map(([name, value]) => describeProperty(name, value)),
      });
    }

    cdpDomains.push({
      domain: domainName,
      types: cdpTypes,
      commands: cdpCommands,
      events: cdpEvents,
    });
  }
  console.log(cdpDomains);
  return cdpDomains;

  function describeProperty(name, value) {
    if (value.__of__) {
      const nested = describeProperty(name, value.__of__);
      if (value.optional)
        return {...nested, optional: true};
      if (value.nullable) {
        return {
          ...nested,
          description: (nested.description && !nested.description.endsWith('.') ? nested.description + '.' : '') + ' Can be <code>NULL</code>',
        };
      }
      console.error('Failed transcribing a property: ', name, value);
      return;
    }
    if (value.optional) {
      if (typeToTypeName.has(value.type)) {
        return {
          name,
          optional: true,
          $ref: typeToTypeName.get(value.type),
        };
      }
      return {
        name,
        optional: true,
        ...value.type,
      };
    }
    if (typeof value === 'string') {
      return {
        name,
        type: value,
      };
    }
    if (value.type === 'array') {
      if (typeToTypeName.has(value.items)) {
        return {
          name,
          type: 'array',
          items: {
            $ref: typeToTypeName.get(value.items),
          },
        };
      }
      return {
        name,
        type: 'array',
        description: value.items.description,
        items: {
          ...value.items,
        },
      };
    }
    if (typeToTypeName.has(value)) {
      return {
        name,
        '$ref': typeToTypeName.get(value),
      };
    }
    if (typeToTypeName.has(value.type)) {
      const $ref = typeToTypeName.get(value.type);
      delete value.type;
      return {
        name,
        ...value,
        $ref,
      };
    }
    return {
      name,
      ...value,
    };
  }
}
