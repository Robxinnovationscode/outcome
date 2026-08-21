/**
 * Direct Firestore REST Client for LigthsON Application
 * Provides seamless Firestore operations using the application's Firebase project credentials.
 */

function toFirestoreValue(val) {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (val instanceof Date) return { timestampValue: val.toISOString() };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(toFirestoreValue) } };
  if (typeof val === 'object') {
    const fields = {};
    for (const [k, v] of Object.entries(val)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
      }
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

function fromFirestoreValue(valObj) {
  if (!valObj) return null;
  if ('stringValue' in valObj) return valObj.stringValue;
  if ('integerValue' in valObj) return parseInt(valObj.integerValue, 10);
  if ('doubleValue' in valObj) return parseFloat(valObj.doubleValue);
  if ('booleanValue' in valObj) return valObj.booleanValue;
  if ('timestampValue' in valObj) return valObj.timestampValue;
  if ('nullValue' in valObj) return null;
  if ('arrayValue' in valObj) return (valObj.arrayValue?.values || []).map(fromFirestoreValue);
  if ('mapValue' in valObj) {
    const res = {};
    for (const [k, v] of Object.entries(valObj.mapValue?.fields || {})) {
      res[k] = fromFirestoreValue(v);
    }
    return res;
  }
  return null;
}

export class RestDocRef {
  constructor(path, id, config) {
    this.path = path;
    this.id = id;
    this.config = config;
  }

  async get() {
    const url = `https://firestore.googleapis.com/v1/projects/${this.config.projectId}/databases/(default)/documents/${this.path}/${this.id}?key=${this.config.apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      return { exists: false, id: this.id, data: () => null };
    }
    const json = await res.json();
    const data = {};
    for (const [k, v] of Object.entries(json.fields || {})) {
      data[k] = fromFirestoreValue(v);
    }
    return { exists: true, id: this.id, data: () => data, ref: this };
  }

  async update(fieldsToUpdate) {
    const params = new URLSearchParams();
    params.set('key', this.config.apiKey);
    const fields = {};
    for (const [k, v] of Object.entries(fieldsToUpdate)) {
      params.append('updateMask.fieldPaths', k);
      fields[k] = toFirestoreValue(v);
    }
    const url = `https://firestore.googleapis.com/v1/projects/${this.config.projectId}/databases/(default)/documents/${this.path}/${this.id}?${params.toString()}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    });
    return res.json();
  }

  async delete() {
    const url = `https://firestore.googleapis.com/v1/projects/${this.config.projectId}/databases/(default)/documents/${this.path}/${this.id}?key=${this.config.apiKey}`;
    const res = await fetch(url, { method: 'DELETE' });
    return res.json();
  }
}

export class RestQuery {
  constructor(collectionPath, config, filters = [], orderBys = [], limitCount = null) {
    this.collectionPath = collectionPath;
    this.config = config;
    this.filters = filters;
    this.orderBys = orderBys;
    this.limitCount = limitCount;
  }

  where(field, op, val) {
    return new RestQuery(
      this.collectionPath,
      this.config,
      [...this.filters, { field, op, val }],
      this.orderBys,
      this.limitCount
    );
  }

  orderBy(field, direction = 'asc') {
    return new RestQuery(
      this.collectionPath,
      this.config,
      this.filters,
      [...this.orderBys, { field, direction }],
      this.limitCount
    );
  }

  limit(n) {
    return new RestQuery(
      this.collectionPath,
      this.config,
      this.filters,
      this.orderBys,
      n
    );
  }

  async get() {
    const segments = this.collectionPath.split('/').filter(Boolean);
    const collectionId = segments.pop();
    const parentPath = segments.length > 0 ? segments.join('/') : '';

    // If no where filter is present, use standard document listing
    if (this.filters.length === 0) {
      const parentUrl = parentPath
        ? `https://firestore.googleapis.com/v1/projects/${this.config.projectId}/databases/(default)/documents/${parentPath}/${collectionId}`
        : `https://firestore.googleapis.com/v1/projects/${this.config.projectId}/databases/(default)/documents/${collectionId}`;
      const params = new URLSearchParams({ key: this.config.apiKey });
      if (this.limitCount) params.set('pageSize', String(this.limitCount));
      if (this.orderBys.length > 0) {
        params.set('orderBy', this.orderBys.map(o => `${o.field} ${o.direction.toLowerCase()}`).join(', '));
      }

      const res = await fetch(`${parentUrl}?${params.toString()}`);
      if (!res.ok) {
        return { docs: [], empty: true, size: 0, forEach: () => {} };
      }
      const json = await res.json();
      const docs = (json.documents || []).map(doc => {
        const id = doc.name.split('/').pop();
        const data = {};
        for (const [k, v] of Object.entries(doc.fields || {})) {
          data[k] = fromFirestoreValue(v);
        }
        return {
          id,
          data: () => data,
          ref: new RestDocRef(this.collectionPath, id, this.config)
        };
      });
      return {
        docs,
        empty: docs.length === 0,
        size: docs.length,
        forEach: (fn) => docs.forEach(fn)
      };
    }

    // Filtered queries use runQuery
    const parentDoc = parentPath
      ? `projects/${this.config.projectId}/databases/(default)/documents/${parentPath}`
      : `projects/${this.config.projectId}/databases/(default)/documents`;
    
    const structuredQuery = {
      from: [{ collectionId }]
    };

    if (this.filters.length === 1) {
      const f = this.filters[0];
      structuredQuery.where = {
        fieldFilter: {
          field: { fieldPath: f.field },
          op: f.op === '==' ? 'EQUAL' : (f.op === '>=' ? 'GREATER_THAN_OR_EQUAL' : 'EQUAL'),
          value: toFirestoreValue(f.val)
        }
      };
    } else if (this.filters.length > 1) {
      structuredQuery.where = {
        compositeFilter: {
          op: 'AND',
          filters: this.filters.map(f => ({
            fieldFilter: {
              field: { fieldPath: f.field },
              op: f.op === '==' ? 'EQUAL' : (f.op === '>=' ? 'GREATER_THAN_OR_EQUAL' : 'EQUAL'),
              value: toFirestoreValue(f.val)
            }
          }))
        }
      };
    }

    if (this.orderBys.length > 0) {
      structuredQuery.orderBy = this.orderBys.map(o => ({
        field: { fieldPath: o.field },
        direction: o.direction.toLowerCase() === 'desc' ? 'DESCENDING' : 'ASCENDING'
      }));
    }

    if (this.limitCount) {
      structuredQuery.limit = this.limitCount;
    }

    const runUrl = `https://firestore.googleapis.com/v1/${parentDoc}:runQuery?key=${this.config.apiKey}`;
    const res = await fetch(runUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery })
    });

    const results = await res.json();
    const docs = [];
    if (Array.isArray(results)) {
      for (const item of results) {
        if (item.document) {
          const id = item.document.name.split('/').pop();
          const data = {};
          for (const [k, v] of Object.entries(item.document.fields || {})) {
            data[k] = fromFirestoreValue(v);
          }
          docs.push({
            id,
            data: () => data,
            ref: new RestDocRef(this.collectionPath, id, this.config)
          });
        }
      }
    }

    return {
      docs,
      empty: docs.length === 0,
      size: docs.length,
      forEach: (fn) => docs.forEach(fn)
    };
  }
}

export class RestCollectionRef extends RestQuery {
  constructor(path, config) {
    super(path, config);
    this.path = path;
  }

  doc(id) {
    return new RestDocRef(this.path, id, this.config);
  }

  async add(data) {
    const segments = this.path.split('/').filter(Boolean);
    const collectionId = segments.pop();
    const parentPath = segments.length > 0 ? segments.join('/') : '';
    const parentUrl = parentPath
      ? `https://firestore.googleapis.com/v1/projects/${this.config.projectId}/databases/(default)/documents/${parentPath}/${collectionId}?key=${this.config.apiKey}`
      : `https://firestore.googleapis.com/v1/projects/${this.config.projectId}/databases/(default)/documents/${collectionId}?key=${this.config.apiKey}`;

    const fields = {};
    for (const [k, v] of Object.entries(data)) {
      if (v !== undefined) {
        fields[k] = toFirestoreValue(v);
      }
    }

    const res = await fetch(parentUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields })
    });
    const json = await res.json();
    const id = json.name ? json.name.split('/').pop() : null;
    return {
      id,
      path: `${this.path}/${id}`
    };
  }
}

export function createFirestoreRestClient(config) {
  return {
    collection: (path) => new RestCollectionRef(path, config)
  };
}
