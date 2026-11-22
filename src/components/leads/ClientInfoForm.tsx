import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { Save } from 'lucide-react';
import { Panel } from '@/components/admin/AdminUI';
import { Button } from '@/components/common/Button';
import { FormField, Input, Textarea } from '@/components/forms/Field';
import { useToast } from '@/contexts/ToastContext';
import { saveClient, notifyLeadsChanged, type ClientInput } from '@/services/leads';
import { toErrorMessage } from '@/lib/errors';
import type { LeadClient } from '@/types/database';

const toForm = (c: LeadClient | null, fallbackCompany: string | null): ClientInput => ({
  company: c?.company ?? fallbackCompany ?? '',
  industry: c?.industry ?? '',
  preferred_contact: c?.preferred_contact ?? '',
  additional_contacts: c?.additional_contacts ?? '',
  notes: c?.notes ?? '',
});

export function ClientInfoForm({
  messageId,
  client,
  originalCompany,
  editable,
  onSaved,
}: {
  messageId: string;
  client: LeadClient | null;
  originalCompany: string | null;
  editable: boolean;
  onSaved: (c: LeadClient) => void;
}) {
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting, isDirty },
  } = useForm<ClientInput>({ defaultValues: toForm(client, originalCompany) });
  // Sync when the stored record changes, without discarding fields the user is editing.
  useEffect(() => reset(toForm(client, originalCompany), { keepDirtyValues: true }), [client?.updated_at, originalCompany, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const saved = await saveClient(messageId, {
        company: values.company.trim(),
        industry: values.industry.trim(),
        preferred_contact: values.preferred_contact.trim(),
        additional_contacts: values.additional_contacts.trim(),
        notes: values.notes.trim(),
      });
      reset(toForm(saved, originalCompany));
      onSaved(saved);
      notifyLeadsChanged();
      toast.success('Client information saved.');
    } catch (err) {
      toast.error(toErrorMessage(err, 'Client information could not be saved.'));
    }
  });

  return (
    <Panel title="Client information" description="Details gathered while talking to the client. The original inquiry is never changed.">
      <form onSubmit={onSubmit} noValidate>
        <fieldset disabled={!editable} className="grid gap-5 sm:grid-cols-2">
          <FormField label="Company / business name" htmlFor="client-company" optional>
            <Input id="client-company" maxLength={200} {...register('company')} />
          </FormField>
          <FormField label="Industry" htmlFor="client-industry" optional>
            <Input id="client-industry" maxLength={200} placeholder="e.g. Tourism, Retail" {...register('industry')} />
          </FormField>
          <FormField label="Preferred contact method" htmlFor="client-preferred" optional>
            <Input id="client-preferred" maxLength={200} placeholder="e.g. Instagram DM, evenings" {...register('preferred_contact')} />
          </FormField>
          <FormField label="Additional contact details" htmlFor="client-contacts" optional>
            <Input id="client-contacts" maxLength={2000} placeholder="Other people, numbers or handles" {...register('additional_contacts')} />
          </FormField>
          <FormField label="General notes" htmlFor="client-notes" optional className="sm:col-span-2">
            <Textarea id="client-notes" rows={4} maxLength={5000} {...register('notes')} />
          </FormField>
        </fieldset>
        {editable ? (
          <div className="mt-5 flex justify-end">
            <Button type="submit" icon={Save} loading={isSubmitting} disabled={!isDirty && !!client}>
              Save client info
            </Button>
          </div>
        ) : (
          <p className="mt-4 text-[13px] text-subtle">Read-only: this lead is not currently editable.</p>
        )}
      </form>
    </Panel>
  );
}
