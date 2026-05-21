import type { ReactNode } from 'react';

interface InputSectionProps {
  title: string;
  children: ReactNode;
}

/**
 * A labelled group of form fields.
 * Uses the `.section-title` class defined in index.css (Cormorant Garamond, small-caps).
 */
export function InputSection({ title, children }: InputSectionProps) {
  return (
    <section className="py-5 px-5 border-b border-border last:border-b-0">
      <h2 className="section-title mb-4">{title}</h2>
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}
