import React from 'react';
import ReactDOM from 'react-dom';
import { BrowserRouter as Router } from 'react-router-dom';
import Header from './components/Header';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import RouterSwitch from './components/RouterSwitch';
import reportWebVitals from './reportWebVitals';

function ComingSoon() {
  return <section className='coming-soon container my-6'>
            <h1>Coming Soon</h1>
            <p>Calculate the ROI of a potential rental property in real-time!</p>
        </section>;
}

ReactDOM.render(
  <React.StrictMode>
    <Router>
      <ComingSoon />
      {/*<Navbar />
      <Header />
      <RouterSwitch />
      <Footer />*/}
    </Router>
  </React.StrictMode>,
  document.getElementById('root')
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
