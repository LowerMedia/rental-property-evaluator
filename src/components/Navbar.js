import React from 'react';
import { Link } from 'react-router-dom';
class Navbar extends React.Component {
	componentDidMount() {
		document.addEventListener('DOMContentLoaded', () => { // Per the bulma docs
		  // Get all "navbar-burger" elements
		  const $navbarBurgers = Array.prototype.slice.call(document.querySelectorAll('.navbar-burger'), 0);
		  // Check if there are any navbar burgers
		  if ($navbarBurgers.length > 0) {
		    // Add a click event on each of them
		    $navbarBurgers.forEach( el => {
		      el.addEventListener('click', (e) => {
		    	e.preventDefault();
		        // Get the target from the "data-target" attribute
		        const target = el.dataset.target;
		        const $target = document.getElementById(target);
		        // Toggle the "is-active" class on both the "navbar-burger" and the "navbar-menu"
		        el.classList.toggle('is-active');
		        $target.classList.toggle('is-active');
		      });
		    });
		  }
		});
	}
	render() {
		return(
			<nav className='navbar container' role='navigation' aria-label='main navigation'>
			  <div className='navbar-brand'>
			    <a className='navbar-item is-size-2' href='/'>&#127960;</a>
				<div className='navbar-item is-hidden-tablet'>
					<h1 className='has-text-black'>Rental Property Evaluator</h1>
				</div>
			    <a href='/' role='button' className='navbar-burger has-text-black' aria-label='menu' aria-expanded='false' data-target='rpeNavbarMenu'>
			      <span aria-hidden='true'></span>
			      <span aria-hidden='true'></span>
			      <span aria-hidden='true'></span>
			    </a>
			  </div>
			  <div id='rpeNavbarMenu' className='navbar-menu'>
			    <div className='navbar-start'>
			      <div className='navbar-item'>
			        <div className='buttons'>
			          <Link className='button is-light' to='/'>Home</Link>
			          <Link className='button is-light' to='/info'>Info</Link>
			          <Link className='button is-light' to='/contact'>Contact</Link>
			        </div>
			      </div>
			    </div>
			    <div className='navbar-start is-hidden-mobile'>
			      <div className='navbar-item'>
			   		<h1 className='has-text-black'>Rental Property Evaluator</h1>
			      </div>
			    </div>
			    <div className='navbar-end'>
			      <div className='navbar-item'>
			        <div className='buttons'>
			          <a href='/' className='button'>
			            <strong>Export</strong>
			          </a>
			          <a href='/' className='button is-primary rpe-reset-link'>
			            Reset
			          </a>
			        </div>
			      </div>
			    </div>
			  </div>
			</nav>
		);
	}
};

export default Navbar;