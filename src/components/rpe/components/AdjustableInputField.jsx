import React from 'react';

export default class AdjustableInputField extends React.Component {
	constructor(props) {
		super(props);
		this.state = {
			value: (this.props.curState.changeable[this.props.id]) ? this.props.curState.changeable[this.props.id] : ( this.props.curState.calculated[this.props.id] ) ? this.props.curState.calculated[this.props.id] : "0"
		}
		this.onCheckboxToggle = this.onCheckboxToggle.bind(this);
		this.childHandleFieldChange = this.childHandleFieldChange.bind(this);
	}
	async childHandleFieldChange(props, targetValue) {
		this.setState({value:targetValue});
		await this.props.handleFieldChange(props,targetValue);
	}
    async onCheckboxToggle(event,props) {
    	await this.setState({ value: event.target.checked })
        this.props.curState.changeable[event.target.id] = event.target.checked
		await this.props.handleFieldChange(props,this.state.value);
    }
	render() {
		const classes = this.props.fieldType === "variableExpenseTotal" ? "disabled" : "adjustable";
		return(
			<div className='formItem flex space-between position-relative'>
				<label className="is-size-6" htmlFor={this.props.id} id={`${this.props.id}-ariaLabel`} >{this.props.labelText}</label>
				<div className="position-relative">
					{ this.props.id === 'TotalPercentageExpensesEstimate' && this.props.curState.calculated.TotalDollarExpensesEstimate ? <span className="calculatedValue">(${this.props.curState.calculated.TotalDollarExpensesEstimate.toLocaleString()})</span> : null }
					{ this.props.fieldType === 'variableExpense' ? <span className="calculatedValue">(${this.props.curState.calculated[this.props.id].toLocaleString()})</span> : null }
					{ this.props.numType === "currency" ? <span className="position-absolute number-symbol dollar">$</span> : null }
					
					{ this.props.numType === "toggle" ? <span className='checkbox-wrap is-size-7 is-block'><input id="IncludeClosingCostsInMortgage" checked={this.state.value} type="checkbox" onChange={(e)=>this.onCheckboxToggle(e,this.props)} /></span> : null }
				
					{this.props.numType !== "toggle" ? <input className={classes} value={this.state.value} onChange={(e) => this.childHandleFieldChange(this.props.id,e.target.value)} type="text" id={this.props.id} data-testid={this.props.id} name={this.props.id} aria-labelledby={`${this.props.id}-ariaLabel`} /> : null }
					
					{ this.props.numType === "percentage" ? <span className="position-absolute number-symbol percentage">%</span> : null }
					{ this.props.numType === "years" ? <span className="position-absolute number-symbol years">yrs</span> : null }
				</div>
			</div>
		)
	};
};