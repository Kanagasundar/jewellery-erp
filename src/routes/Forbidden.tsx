import { ShieldAlert } from 'lucide-react'
import { EmptyState } from '@/components/ui/Feedback'

export function Forbidden() {
  return <div className="card mt-10"><EmptyState icon={<ShieldAlert size={20} />} title="You don’t have access to this screen" hint="Ask an administrator to grant the required permission, or switch role from the user menu (demo)." /></div>
}
