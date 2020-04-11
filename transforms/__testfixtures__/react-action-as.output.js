import { someAction as someActionAction } from '../actions';

const mapDispatchToProps = (dispatch) => (
  bindActionCreators(
    {
      someAction: someActionAction
    },
    dispatch
  )
)
