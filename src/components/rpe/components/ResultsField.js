import React from 'react';

export default class ResultsField extends React.Component {
	render() {
		return(
			<div className='flex space-between'>
				<label className="is-size-1" id={`${this.props.fieldTitle}-label`} htmlFor={this.props.fieldTitle}>{this.props.fieldTitle}</label>
				<span className="is-size-1" id={this.props.fieldTitle}>{ (this.props.result) ? this.props.result.toFixed(2) : this.props.result}{ ( this.props.isPercentage ) ? "%" : ""}</span>
			</div>
		)
	}
}