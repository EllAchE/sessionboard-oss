import { constraintsOf, expandable, resolveSchema, typeLabel, type JsonSchema } from './spec';
import styles from './api-docs.module.css';

/**
 * Draws a schema out as an indented field list: name, type, whether it is required, and any
 * constraint the generator carried over from Zod. `$ref`s are resolved into `components.schemas`
 * before rendering, so `data: Session[]` expands into Session's own fields rather than stopping at
 * a pointer the reader would have to chase.
 */

/** Objects nest three deep at most in this spec; the cap stops a future one from running away. */
const MAX_DEPTH = 3;

export function FieldRow({
  name,
  schema,
  required,
  description,
  depth,
}: {
  name: string;
  schema?: JsonSchema;
  required?: boolean;
  description?: string;
  depth: number;
}) {
  const resolved = resolveSchema(schema) ?? schema;
  const notes = constraintsOf(resolved);
  const text = description ?? resolved?.description;
  const nested = expandable(schema);

  return (
    <li className={styles.field}>
      <p className={styles.fieldHead}>
        <code className={styles.fieldName}>{name}</code>
        <span className={styles.fieldType}>{typeLabel(schema)}</span>
        {required ? (
          <span className={styles.fieldRequired}>required</span>
        ) : (
          <span className={styles.fieldOptional}>optional</span>
        )}
      </p>
      {text ? <p className={styles.fieldNote}>{text}</p> : null}
      {notes.length ? <p className={styles.fieldConstraints}>{notes.join(' · ')}</p> : null}
      {nested ? (
        depth + 1 < MAX_DEPTH ? (
          <SchemaFields schema={schema} depth={depth + 1} />
        ) : (
          <p className={styles.fieldConstraints}>
            Deeper fields are in the <a href="/api/v1/openapi.json">OpenAPI document</a>.
          </p>
        )
      ) : null}
    </li>
  );
}

export function SchemaFields({ schema, depth = 0 }: { schema?: JsonSchema; depth?: number }) {
  const object = expandable(schema);
  if (!object?.properties) return null;

  const required = new Set(object.required ?? []);

  return (
    <ul className={styles.fields} data-depth={depth}>
      {Object.entries(object.properties).map(([name, property]) => (
        <FieldRow
          key={name}
          name={name}
          schema={property}
          required={required.has(name)}
          depth={depth}
        />
      ))}
    </ul>
  );
}

/** A whole request or response body: its type line, then its fields. */
export function SchemaBlock({ schema }: { schema?: JsonSchema }) {
  const resolved = resolveSchema(schema);
  const fields = expandable(schema);

  return (
    <div className={styles.schemaBlock}>
      <p className={styles.schemaType}>
        <span className={styles.fieldType}>{typeLabel(schema)}</span>
        {resolved?.description ? <span className={styles.schemaNote}>{resolved.description}</span> : null}
      </p>
      {fields ? <SchemaFields schema={schema} /> : null}
    </div>
  );
}
