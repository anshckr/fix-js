import React, { Component } from 'react';

class SomeClassComponent extends React.Component {
  someMethod = () => {
    const {
      someProp: someProp
    } = this.props;

    return someProp;
  }

  render() {
    const {
      someProp: someProp,
      someState: someState
    } = this.props;

    return <div>{`${someProp} && ${someState}`}</div>;
  }
}

const SomeFunctionalComponent = (
  {
    someProp1: someProp2,
    someProp: someProp
  }
) => {
  return <div>{someProp}</div>;
}
