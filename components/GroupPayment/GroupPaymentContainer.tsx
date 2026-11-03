"use client";

import { useRef, useState, type FormEvent } from "react";
import { useGetAllGroups, useGetGroupPayments, useCreateGroupPayment } from "@/services/api/group-payment";
import { useModal } from "@/contexts/ModalManagerProvider";
import toast from "react-hot-toast";
import CollectionDetails from "./CollectionDetails";

export default function GroupPaymentContainer() {
  const groups = useGetAllGroups();
  const collections = useGetGroupPayments();
  const create = useCreateGroupPayment();
  const { openModal } = useModal();
  const [groupId, setGroupId] = useState<number | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const id = useRef<string | null>(null);
  const selected = collections.data.payments.find(item => item.id === selectedId) || collections.data.payments[0];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    id.current ||= crypto.randomUUID();
    try {
      const result = await create.mutateAsync({ id: id.current, title: String(data.get("title")), amount: String(data.get("amount")), groupId, memberCount: Number(data.get("memberCount")) });
      id.current = null;
      setSelectedId(result.id);
      form.reset();
      toast.success("Collection links created");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Collection could not be created"); }
  }

  return <main className="w-full space-y-5 p-4 text-text-primary sm:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-2xl font-semibold">Group collections</h1><p className="mt-1 text-sm text-text-secondary">Split a USDC collection into exact contributions with single-use NEAR payment links.</p></div><button type="button" onClick={() => openModal("CREATE_NEW_GROUP")} className="rounded-lg border border-primary-divider px-4 py-3 text-sm">New group</button></header>
    {groups.error && <p role="alert" className="text-sm text-red-600">{groups.error.message}</p>}
    <section aria-label="Your groups" className="space-y-2"><h2 className="text-sm font-semibold">Your groups</h2><div className="flex flex-wrap gap-2">{groups.data?.map(group => <button type="button" key={group.id} onClick={() => openModal("EDIT_GROUP", { group })} className="rounded-xl border border-primary-divider bg-background px-4 py-3 text-left text-sm"><span className="block font-medium">{group.name}</span><span className="text-text-secondary">{group.members.length} members · Edit</span></button>)}{!groups.isLoading && !groups.data?.length && <p className="rounded-xl border border-primary-divider bg-background p-4 text-sm text-text-secondary">No saved groups yet. Quick share is available below.</p>}</div></section>
    <section className="grid items-start gap-5 xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
      <div className="space-y-4 rounded-2xl border border-primary-divider bg-background p-5"><div><h2 className="text-lg font-semibold">Quick share</h2><p className="text-sm text-text-secondary">Create a group collection or split an amount among contributors.</p></div>
        <form onSubmit={submit} className="grid gap-3 text-sm"><label>Collection title<input name="title" required maxLength={160} className="mt-1 w-full rounded-lg border border-primary-divider bg-background p-3" /></label><label>Total (USDC)<input name="amount" required inputMode="decimal" className="num mt-1 w-full rounded-lg border border-primary-divider bg-background p-3" /></label><label>Group<select value={groupId || ""} onChange={event => { setGroupId(event.target.value ? Number(event.target.value) : null); id.current = null; }} className="mt-1 w-full rounded-lg border border-primary-divider bg-background p-3"><option value="">Quick share</option>{groups.data?.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>{groupId === null && <label>Number of contributors<input name="memberCount" type="number" min={1} max={100} defaultValue={2} required className="mt-1 w-full rounded-lg border border-primary-divider bg-background p-3" /></label>}<button disabled={create.isPending || !!groups.error} className="rounded-lg bg-primary-blue p-3 font-medium text-white disabled:opacity-50">{create.isPending ? "Creating…" : "Create collection"}</button></form>
      </div>
      <div className="min-w-0 space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">Collections</h2><button type="button" onClick={() => void collections.refetch()} className="text-sm text-primary-blue underline">Refresh settlement</button></div>
        {collections.error ? <p role="alert" className="text-sm text-red-600">{collections.error.message}</p> : collections.isLoading ? <p role="status" className="text-sm text-text-secondary">Loading collections…</p> : !collections.data.payments.length ? <div className="rounded-xl border border-primary-divider bg-background p-8 text-center text-sm text-text-secondary">No collections created.</div> : <><div className="flex gap-2 overflow-x-auto pb-1">{collections.data.payments.map(collection => <button type="button" key={collection.id} aria-pressed={selected?.id === collection.id} onClick={() => setSelectedId(collection.id)} className={`shrink-0 rounded-xl border px-3 py-2 text-left text-sm ${selected?.id === collection.id ? "border-primary-blue bg-app-background" : "border-primary-divider bg-background"}`}><span className="block font-medium">{collection.title}</span><span className="num text-xs text-text-secondary">{collection.members.filter(member => member.paid).length}/{collection.members.length} paid · {collection.amount} USDC</span></button>)}</div>{selected && <CollectionDetails collection={selected} />}</>}
      </div>
    </section>
  </main>;
}
