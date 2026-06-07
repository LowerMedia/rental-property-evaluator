/**
 * Minimal type declarations for @wordpress/* packages used in the editor build.
 *
 * We declare only what RPE-36 needs so we can skip installing the full
 * @wordpress/blocks and @wordpress/element devDependencies (each ~30 MB of
 * transitive webpack/babel toolchain). At runtime these come from WordPress
 * globals (wp.blocks, wp.element).
 */

declare module '@wordpress/blocks' {
  /** Props passed to a block's edit() function. */
  export interface BlockEditProps<
    TAttributes extends Record<string, unknown> = Record<string, unknown>,
  > {
    attributes: TAttributes;
    setAttributes: (attrs: Partial<TAttributes>) => void;
    className?: string;
    isSelected?: boolean;
  }

  /**
   * Register a Gutenberg block type.
   * nameOrMetadata: block name string OR a block.json metadata object.
   */
  export function registerBlockType(
    nameOrMetadata: string | Record<string, unknown>,
    settings: {
      edit: (props: BlockEditProps) => React.ReactNode | null;
      save: (props: { attributes: Record<string, unknown> }) => React.ReactNode | null;
      [key: string]: unknown;
    },
  ): void;
}
