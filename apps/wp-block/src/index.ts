/**
 * index.ts — Editor script for rpe/evaluator Gutenberg block (RPE-36).
 *
 * Registers the block using block.json metadata. The edit component shows a
 * static placeholder; save() returns null because the block is dynamic —
 * the PHP render_callback (RPE-37) outputs the frontend container.
 *
 * External dependencies (provided by WordPress at runtime):
 *   @wordpress/blocks → wp.blocks
 *   react             → wp.element (WP 6.x ships React 18 via wp.element)
 *   react-dom         → wp.element
 */

import { registerBlockType } from '@wordpress/blocks';
import { Edit } from './edit';
import metadata from '../block.json';

registerBlockType(metadata.name, {
  edit: Edit,

  /**
   * Dynamic block: returns null so WordPress does not store serialized HTML.
   * The PHP render_callback generates the container on every page load.
   */
  save: () => null,
});
