import React, { Component } from 'react';

class SomeClassComponent extends React.Component {
  someMethod = () => {
    return this.props.someProp;
  }

  render() {
    return (<div>{`${this.props.someProp} && ${this.props.someState}`}</div>);
  }
}

const SomeFunctionalComponent = (props) => {
  const someProp2 = props.someProp1;

  return (
    <div>{props.someProp}</div>
  )
}
