import { someAction } from '../actions';

const mapDispatchToProps = (dispatch) => (
  bindActionCreators(
    {
      someAction
    },
    dispatch
  )
)
