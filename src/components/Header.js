import logo from './lowprop.png';
import React from 'react';

const Header = () => {
	return(
		<header className="App-header width-full flex pt-3 mb-5">
			<div className="align-left circle-background has-background-white">
				<img src={logo} className="App-logo hidden" alt="logo" />
			</div>
			<div className="align-right container is-hidden-touch is-hidden-desktop">
				<h1 className="left is-size-3 has-text-black">Rental Property Evaluator</h1>
				<p className="left is-size-5 hidden">This is used to calculate numbers on a potential rental property.</p>
			</div>
		</header>
	);
};

export default Header;