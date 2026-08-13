'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardDescription,
  CardTitle,
  Input,
  Select,
  Tag,
  Textarea,
  useToast,
} from '@/components/ui';
import { createFieldAction, deleteFieldAction } from '../actions';
import type { FieldWire } from '../wire';
import styles from '../crm.module.css';

export type FieldTypeWire = {
  value: string;
  label: string;
  takesOptions: boolean;
};

type Props = { fields: FieldWire[]; types: FieldTypeWire[] };

export function FieldManager({ fields, types }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [label, setLabel] = useState('');
  const [type, setType] = useState(types[0]?.value ?? 'short_text');
  const [options, setOptions] = useState('');
  const [error, setError] = useState<string | null>(null);

  const takesOptions = types.find((entry) => entry.value === type)?.takesOptions ?? false;

  const create = () => {
    setError(null);
    startTransition(async () => {
      const result = await createFieldAction({
        label,
        type: type as never,
        options: options.split(/[,\n]/),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLabel('');
      setOptions('');
      toast({ title: 'Field created', tone: 'success' });
      router.refresh();
    });
  };

  const remove = (fieldId: string) => {
    startTransition(async () => {
      const result = await deleteFieldAction(fieldId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast({ title: 'Field deleted', tone: 'success' });
      router.refresh();
    });
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>The census</p>
          <h1 className={styles.title}>Custom inscriptions</h1>
          <p className={styles.subtitle}>
            Your own inscriptions on every citizen. A choice field also becomes a lens over the
            census.
          </p>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.split}>
        <Card>
          <CardHeader>
            <CardTitle>New inscription</CardTitle>
            <CardDescription>
              For example, an Orator rank choice with Citizen and Foreign envoy.
            </CardDescription>
          </CardHeader>
          <CardBody>
            <div className={styles.stack}>
              <label className={styles.field}>
                <span className={styles.label}>Field name</span>
                <Input
                  placeholder="Orator rank"
                  value={label}
                  onChange={(entry) => setLabel(entry.currentTarget.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Field type</span>
                <Select value={type} onChange={(entry) => setType(entry.currentTarget.value)}>
                  {types.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </Select>
              </label>
              {takesOptions ? (
                <label className={styles.field}>
                  <span className={styles.label}>Options</span>
                  <Textarea
                    rows={4}
                    placeholder={'Internal\nExternal'}
                    value={options}
                    onChange={(entry) => setOptions(entry.currentTarget.value)}
                  />
                  <span className={styles.hint}>One per line, or separated by commas.</span>
                </label>
              ) : null}
              <div>
                <Button
                  variant="primary"
                  iconLeft={<Plus size={14} />}
                  loading={pending}
                  onClick={create}
                >
                  Inscribe field
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Existing inscriptions</CardTitle>
          </CardHeader>
          <CardBody>
            {fields.length === 0 ? (
              <p className={styles.hint}>None yet.</p>
            ) : (
              <div className={styles.stack}>
                {fields.map((field) => (
                  <div key={field.id} className={styles.note}>
                    <div className={styles.spread}>
                      <span className={styles.value}>{field.label}</span>
                      <Badge>{field.type}</Badge>
                    </div>
                    {field.options.length > 0 ? (
                      <span className={styles.tagRow}>
                        {field.options.map((option) => (
                          <Tag key={option}>{option}</Tag>
                        ))}
                      </span>
                    ) : null}
                    <div className={styles.spread}>
                      <span className={styles.timelineMeta}>key: {field.key}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        iconLeft={<Trash2 size={14} />}
                        loading={pending}
                        onClick={() => remove(field.id)}
                      >
                        Erase
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
