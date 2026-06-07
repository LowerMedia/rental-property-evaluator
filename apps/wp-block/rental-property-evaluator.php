<?php
/**
 * Plugin Name:       Rental Property Evaluator Block
 * Plugin URI:        https://lowermedia.net/plugins/rental-property-evaluator
 * Description:       Dynamic Gutenberg block that mounts the Rental Property Evaluator SPA on WordPress pages.
 * Version:           1.2.0
 * Requires at least: 6.3
 * Requires PHP:      8.1
 * Author:            9ete
 * Author URI:        https://lowermedia.net
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:       rental-property-evaluator
 * Domain Path:       /languages
 *
 * @package RentalPropertyEvaluator
 */

declare( strict_types=1 );

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Registers and renders the rpe/evaluator Gutenberg block.
 *
 * Uses block.json metadata so WordPress automatically enqueues
 * editorScript (build/index.js), viewScript (build/frontend.js),
 * and viewStyle (build/frontend.css) at the correct times.
 * The render_callback outputs the mount-target container div;
 * the self-contained frontend IIFE (frontend.js) finds it by
 * the data-rpe-block="evaluator" attribute and mounts <Evaluator />.
 */
final class RPE_Block {

	/**
	 * Bootstrap: hooks block registration onto the `init` action.
	 */
	public function __construct() {
		add_action( 'init', array( $this, 'register' ) );
	}

	/**
	 * Registers the block type from block.json.
	 *
	 * Passing __DIR__ makes WordPress resolve the `file:` asset paths
	 * in block.json relative to this plugin directory. The render_callback
	 * key is the only setting that cannot be expressed in JSON.
	 */
	public function register(): void {
		register_block_type(
			__DIR__ . '/block.json',
			array(
				'render_callback' => array( $this, 'render' ),
			)
		);
	}

	/**
	 * Outputs the block container on the WordPress frontend.
	 *
	 * Returns a single div with the data-rpe-block mount attribute.
	 * viewScript (frontend.js) is auto-enqueued by WordPress when this
	 * block is present on the page; it finds this container and mounts
	 * the React app into it on DOMContentLoaded.
	 *
	 * @param array<string,mixed> $_attributes Block attributes (none defined in this version).
	 * @param string              $_content    Inner block content (unused — no inner blocks).
	 * @return string Rendered HTML.
	 */
	public function render( array $_attributes, string $_content ): string {
		return '<div data-rpe-block="evaluator"></div>';
	}
}

new RPE_Block();
