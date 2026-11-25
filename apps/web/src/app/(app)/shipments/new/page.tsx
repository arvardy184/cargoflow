import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/app-shell';
import { CreateShipmentForm } from '@/components/shipments/create-shipment-form';

export const metadata: Metadata = { title: 'New shipment' };

export default function NewShipmentPage() {
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-2 text-sm text-muted">
        <Link href="/shipments" className="hover:text-ink hover:underline">
          Shipments
        </Link>
        <span aria-hidden> / </span>
        <span className="text-ink">New</span>
      </nav>
      <PageHeader
        title="New shipment"
        description="Register a container move. You can confirm the booking afterwards."
      />
      <div className="max-w-3xl rounded-panel border border-line bg-surface p-5 sm:p-6">
        <CreateShipmentForm />
      </div>
    </>
  );
}
